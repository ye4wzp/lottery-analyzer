#!/usr/bin/env python3
"""
彩票数据分析大师 - 本地服务器
提供静态文件服务 + 多源 API 代理（解决 CORS 问题）

数据源优先级：
  - 双色球(SSQ):   500.com (HTML) ✅ 国内外均可访问
  - 大乐透(DLT):   sporttery.cn → 500.com fallback
  - 排列三(PL3):   sporttery.cn → 开彩网 fallback
  - 排列五(PL5):   sporttery.cn → 开彩网 fallback
  - 福彩3D(FC3D):  zhcw.com → 开彩网 fallback
  - 七乐彩(QLC):   zhcw.com → 500.com fallback

Usage: python3 server.py
"""

import http.server
import urllib.request
import json
import sys
import os
import ssl
import re

PORT = 8899

# Optional MXNZP API credentials for an additional fallback data source.
MXNZP_APP_ID = os.environ.get('MXNZP_APP_ID', '')
MXNZP_APP_SECRET = os.environ.get('MXNZP_APP_SECRET', '')

# SSL context
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*'
}


class LotteryProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/api/'):
            self.proxy_api()
        else:
            super().do_GET()

    def proxy_api(self):
        path = self.path[5:]  # remove "/api/"
        if '?' in path:
            code = path.split('?')[0].strip('/')
            params = dict(p.split('=') for p in path.split('?')[1].split('&') if '=' in p)
            count = int(params.get('count', params.get('rows', '100')))
        else:
            parts = path.replace('.json', '').split('-')
            code = parts[0]
            count = int(parts[1]) if len(parts) > 1 else 100

        result = None

        # Try sources in priority order with fallbacks
        if code == 'ssq':
            result = self.fetch_500com('ssq', count)
        elif code == 'dlt':
            result = self.fetch_sporttery('dlt', count)
            if not result:
                result = self.fetch_500com('dlt', count)
        elif code == 'pl3':
            result = self.fetch_sporttery('pl3', count)
            if not result:
                result = self.fetch_mxnzp('pl3', count)
        elif code == 'pl5':
            result = self.fetch_sporttery('pl5', count)
            if not result:
                result = self.fetch_mxnzp('pl5', count)
        elif code == 'fc3d':
            result = self.fetch_zhcw_fc3d(count)
            if not result:
                result = self.fetch_mxnzp('fc3d', count)
        elif code == 'qlc':
            result = self.fetch_zhcw_qlc(count)
            if not result:
                result = self.fetch_500com('qlc', count)
            if not result:
                result = self.fetch_mxnzp('qlc', count)

        # Global fallback: 开彩网
        if not result:
            result = self.fetch_kaicai(code, count)

        if result:
            self.send_json(result)
        else:
            self.send_error_json(502, f"All API sources failed for '{code}'")

    # ===== 500.com (HTML parsing, works overseas) =====
    def fetch_500com(self, code, count):
        """Parse 500.com history pages - works from overseas servers.
        Supports: ssq, dlt, qlc"""
        code_map = {
            'ssq': {'path': 'ssq', 'red_range': (2, 8), 'blue_range': (8, 9), 'min_tds': 9},
            'dlt': {'path': 'dlt', 'red_range': (2, 7), 'blue_range': (7, 9), 'min_tds': 9},
            'qlc': {'path': 'qlc', 'red_range': (2, 9), 'blue_range': (9, 10), 'min_tds': 10},
        }
        cfg = code_map.get(code)
        if not cfg:
            return None

        url = f"https://datachart.500.com/{cfg['path']}/history/newinc/history.php?limit={count}&sort=0"
        try:
            req = urllib.request.Request(url, headers={
                **HEADERS,
                'Referer': f"https://datachart.500.com/{cfg['path']}/"
            })
            with urllib.request.urlopen(req, timeout=15, context=ssl_ctx) as response:
                html = response.read().decode('utf-8', errors='replace')

            rows = []
            # Try t_tr1 class first (SSQ/DLT), then generic tr in chart table (QLC)
            tr_matches = re.findall(r'<tr class="t_tr1"[^>]*>(.*?)</tr>', html, re.DOTALL)
            if not tr_matches:
                # QLC uses rows inside table#tablelist
                table_match = re.search(r'<table[^>]*id="tablelist"[^>]*>(.*?)</table>', html, re.DOTALL)
                if table_match:
                    tr_matches = re.findall(r'<tr>(.*?)</tr>', table_match.group(1), re.DOTALL)

            td_pattern = re.compile(r'<td[^>]*>(.*?)</td>', re.DOTALL)

            for tr_html in tr_matches:
                tds = td_pattern.findall(tr_html)
                clean = [re.sub(r'<[^>]+>', '', td).strip().replace('&nbsp;', '') for td in tds]

                if len(clean) < cfg['min_tds']:
                    continue

                period = clean[1]
                if not period.isdigit():
                    continue

                r_start, r_end = cfg['red_range']
                b_start, b_end = cfg['blue_range']

                main_balls = []
                for i in range(r_start, r_end):
                    if i < len(clean) and clean[i].isdigit():
                        main_balls.append(int(clean[i]))

                bonus_balls = []
                for i in range(b_start, b_end):
                    if i < len(clean) and clean[i].isdigit():
                        bonus_balls.append(int(clean[i]))

                # Find date
                date_str = ''
                for td in reversed(clean):
                    if re.match(r'20\d{2}-\d{2}-\d{2}', td):
                        date_str = td
                        break

                expected_main = r_end - r_start
                if len(main_balls) == expected_main:
                    rows.append({
                        'period': period,
                        'date': date_str,
                        'main': sorted(main_balls),
                        'bonus': bonus_balls,
                        'source': '500.com'
                    })

            if rows:
                sys.stderr.write(f"[API] 500.com/{code}: got {len(rows)} records\n")
                return {'rows': rows, 'source': '500.com', 'total': len(rows)}

        except Exception as e:
            sys.stderr.write(f"[API] 500.com/{code} failed: {e}\n")
        return None

    # ===== sporttery.cn 体彩 (DLT, PL3, PL5) =====
    def fetch_sporttery(self, code, count):
        game_map = {
            'dlt': '85',
            'pl3': '35',
            'pl5': '350133'
        }
        game_no = game_map.get(code)
        if not game_no:
            return None

        url = f"https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo={game_no}&provinceId=0&pageSize={count}&isVerify=1&pageNo=1"
        try:
            req = urllib.request.Request(url, headers={
                **HEADERS,
                'Referer': 'https://www.lottery.gov.cn/'
            })
            with urllib.request.urlopen(req, timeout=15, context=ssl_ctx) as response:
                raw = json.loads(response.read())

            items = raw.get('value', {}).get('list', [])
            if not items:
                return None

            rows = []
            for item in items:
                result = item.get('lotteryDrawResult', '')
                nums = result.split()

                if code == 'dlt' and len(nums) >= 7:
                    rows.append({
                        'period': item.get('lotteryDrawNum', ''),
                        'date': item.get('lotteryDrawTime', ''),
                        'main': [int(n) for n in nums[:5]],
                        'bonus': [int(n) for n in nums[5:7]],
                        'source': 'sporttery.cn'
                    })
                elif code == 'pl3' and len(nums) >= 3:
                    rows.append({
                        'period': item.get('lotteryDrawNum', ''),
                        'date': item.get('lotteryDrawTime', ''),
                        'main': [int(n) for n in nums[:3]],
                        'bonus': [],
                        'source': 'sporttery.cn'
                    })
                elif code == 'pl5' and len(nums) >= 5:
                    unsorted = item.get('lotteryUnsortDrawresult', result)
                    pnums = unsorted.split()
                    rows.append({
                        'period': item.get('lotteryDrawNum', ''),
                        'date': item.get('lotteryDrawTime', ''),
                        'main': [int(n) for n in pnums[:5]],
                        'bonus': [],
                        'source': 'sporttery.cn'
                    })

            if rows:
                sys.stderr.write(f"[API] sporttery.cn/{code}: got {len(rows)} records\n")
                return {'rows': rows, 'source': 'sporttery.cn', 'total': len(rows)}

        except Exception as e:
            sys.stderr.write(f"[API] sporttery.cn/{code} failed: {e}\n")
        return None

    # ===== 中彩网 zhcw.com FC3D (HTML parsing) =====
    def fetch_zhcw_fc3d(self, count):
        rows = []
        per_page = 30
        pages_needed = min((count // per_page) + 1, 7)

        for page in range(1, pages_needed + 1):
            url = f"https://kaijiang.zhcw.com/zhcw/html/3d/list_{page}.html"
            try:
                req = urllib.request.Request(url, headers=HEADERS)
                with urllib.request.urlopen(req, timeout=12, context=ssl_ctx) as response:
                    html = response.read().decode('utf-8', errors='replace')

                trs = re.findall(r'<tr>(.*?)</tr>', html, re.DOTALL)
                for tr in trs:
                    tds = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.DOTALL)
                    if len(tds) < 3:
                        continue

                    date_raw = re.sub(r'<[^>]+>', '', tds[0]).strip()
                    period_raw = re.sub(r'<[^>]+>', '', tds[1]).strip()

                    if not re.match(r'^\d{7}$', period_raw):
                        continue

                    nums = re.findall(r'<em>(\d)</em>', tds[2])
                    if len(nums) >= 3:
                        rows.append({
                            'period': period_raw,
                            'date': date_raw,
                            'main': [int(n) for n in nums[:3]],
                            'bonus': [],
                            'source': 'zhcw.com'
                        })

                if len(rows) >= count:
                    break

            except Exception as e:
                sys.stderr.write(f"[API] zhcw.com/fc3d page {page} failed: {e}\n")
                break

        if rows:
            sys.stderr.write(f"[API] zhcw.com/fc3d: got {len(rows)} records\n")
            return {'rows': rows[:count], 'source': 'zhcw.com', 'total': len(rows)}
        return None

    # ===== 中彩网 zhcw.com QLC (HTML parsing) =====
    def fetch_zhcw_qlc(self, count):
        rows = []
        per_page = 20
        pages_needed = min((count // per_page) + 1, 10)

        for page in range(1, pages_needed + 1):
            url = f"https://kaijiang.zhcw.com/zhcw/html/qlc/list_{page}.html"
            try:
                req = urllib.request.Request(url, headers=HEADERS)
                with urllib.request.urlopen(req, timeout=12, context=ssl_ctx) as response:
                    html = response.read().decode('utf-8', errors='replace')

                trs = re.findall(r'<tr>(.*?)</tr>', html, re.DOTALL)
                for tr in trs:
                    tds = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.DOTALL)
                    if len(tds) < 3:
                        continue

                    date_raw = re.sub(r'<[^>]+>', '', tds[0]).strip()
                    period_raw = re.sub(r'<[^>]+>', '', tds[1]).strip()

                    if not re.match(r'^\d{7}$', period_raw):
                        continue

                    nums_text = re.sub(r'<[^>]+>', ' ', tds[2]).strip()
                    nums = re.findall(r'\d+', nums_text)

                    if len(nums) >= 8:
                        main_nums = sorted([int(n) for n in nums[:7]])
                        bonus_num = [int(nums[7])]
                        rows.append({
                            'period': period_raw,
                            'date': date_raw,
                            'main': main_nums,
                            'bonus': bonus_num,
                            'source': 'zhcw.com'
                        })

                if len(rows) >= count:
                    break

            except Exception as e:
                sys.stderr.write(f"[API] zhcw.com/qlc page {page} failed: {e}\n")
                break

        if rows:
            sys.stderr.write(f"[API] zhcw.com/qlc: got {len(rows)} records\n")
            return {'rows': rows[:count], 'source': 'zhcw.com', 'total': len(rows)}
        return None

    # ===== MXNZP API (international, works overseas) =====
    def fetch_mxnzp(self, code, count):
        """Fetch from mxnzp.com free API - works from any IP worldwide.
        Free tier: QPS=1, so max 1 request per second."""
        if not MXNZP_APP_ID or not MXNZP_APP_SECRET:
            sys.stderr.write(f"[API] mxnzp/{code}: skipped, MXNZP credentials not configured\n")
            return None

        # MXNZP max size per request is 50
        size = min(count, 50)
        url = f"https://www.mxnzp.com/api/lottery/common/history?code={code}&size={size}&app_id={MXNZP_APP_ID}&app_secret={MXNZP_APP_SECRET}"
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15, context=ssl_ctx) as response:
                raw = json.loads(response.read())

            if raw.get('code') != 1 or not raw.get('data'):
                sys.stderr.write(f"[API] mxnzp/{code}: {raw.get('msg', 'no data')}\n")
                return None

            rows = []
            for item in raw['data']:
                open_code = item.get('openCode', '')
                expect = item.get('expect', '')
                time_str = item.get('time', '')[:10]

                if code in ('fc3d', 'pl3'):
                    nums = open_code.split(',')
                    rows.append({
                        'period': expect,
                        'date': time_str,
                        'main': [int(n) for n in nums[:3]],
                        'bonus': [],
                        'source': 'mxnzp.com'
                    })
                elif code == 'pl5':
                    nums = open_code.split(',')
                    rows.append({
                        'period': expect,
                        'date': time_str,
                        'main': [int(n) for n in nums[:5]],
                        'bonus': [],
                        'source': 'mxnzp.com'
                    })
                elif code == 'qlc':
                    parts = open_code.split('+')
                    main_nums = [int(n) for n in parts[0].split(',')]
                    bonus = [int(parts[1])] if len(parts) > 1 else []
                    rows.append({
                        'period': expect,
                        'date': time_str,
                        'main': sorted(main_nums),
                        'bonus': bonus,
                        'source': 'mxnzp.com'
                    })
                elif code == 'ssq':
                    parts = open_code.split('+')
                    main_nums = [int(n) for n in parts[0].split(',')]
                    bonus = [int(parts[1])] if len(parts) > 1 else []
                    rows.append({
                        'period': expect,
                        'date': time_str,
                        'main': sorted(main_nums),
                        'bonus': bonus,
                        'source': 'mxnzp.com'
                    })
                elif code == 'dlt':
                    parts = open_code.split('+')
                    main_nums = [int(n) for n in parts[0].split(',')]
                    bonus = [int(n) for n in parts[1].split(',')] if len(parts) > 1 else []
                    rows.append({
                        'period': expect,
                        'date': time_str,
                        'main': sorted(main_nums),
                        'bonus': bonus,
                        'source': 'mxnzp.com'
                    })

            if rows:
                sys.stderr.write(f"[API] mxnzp/{code}: got {len(rows)} records\n")
                return {'rows': rows, 'source': 'mxnzp.com', 'total': len(rows)}

        except Exception as e:
            sys.stderr.write(f"[API] mxnzp/{code} failed: {e}\n")
        return None

    # ===== 开彩网 (global fallback) =====
    def fetch_kaicai(self, code, count):
        url = f"http://f.apiplus.net/{code}-{count}.json"
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json'
            })
            with urllib.request.urlopen(req, timeout=8) as response:
                data = json.loads(response.read())
            if 'rows' in data and data['rows']:
                sys.stderr.write(f"[API] kaicai/{code}: got {len(data['rows'])} records\n")
                return data
        except Exception as e:
            sys.stderr.write(f"[API] kaicai/{code} failed: {e}\n")
        return None

    def send_json(self, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'max-age=300')
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, code, message):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}, ensure_ascii=False).encode('utf-8'))

    def log_message(self, format, *args):
        if '/api/' in (args[0] if args else ''):
            sys.stderr.write(f"[API] {args[0]}\n")


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with http.server.HTTPServer(("", PORT), LotteryProxyHandler) as httpd:
        print(f"🎰 彩票数据分析大师")
        print(f"   http://localhost:{PORT}")
        print(f"   SSQ → 500.com | DLT → sporttery/500 | FC3D → zhcw | QLC → zhcw/500")
        print(f"   PL3/PL5 → sporttery | 全局兜底 → 开彩网")
        print(f"   Ctrl+C 停止\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n服务已停止")


if __name__ == "__main__":
    main()
