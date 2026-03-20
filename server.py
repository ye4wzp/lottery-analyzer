#!/usr/bin/env python3
"""
彩票数据分析大师 - 本地服务器
提供静态文件服务 + 多源 API 代理（解决 CORS 问题）

数据源：
  - 双色球(SSQ):   500.com 数据图表 (HTML 解析)
  - 大乐透(DLT):   体彩官网 sporttery.cn (JSON API)
  - 排列三(PL3):   体彩官网 sporttery.cn (JSON API, gameNo=35)
  - 排列五(PL5):   体彩官网 sporttery.cn (JSON API, gameNo=350133)
  - 福彩3D(FC3D):  中彩网 zhcw.com (HTML 解析)
  - 七乐彩(QLC):   中彩网 zhcw.com (HTML 解析)

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

        # Route to correct data source
        if code == 'ssq':
            result = self.fetch_500com_ssq(count)
        elif code == 'dlt':
            result = self.fetch_sporttery(code, count)
        elif code in ('pl3', 'pl5'):
            result = self.fetch_sporttery(code, count)
        elif code == 'fc3d':
            result = self.fetch_zhcw_fc3d(count)
        elif code == 'qlc':
            result = self.fetch_zhcw_qlc(count)

        # Fallback: 开彩网
        if not result:
            result = self.fetch_kaicai(code, count)

        if result:
            self.send_json(result)
        else:
            self.send_error_json(502, f"All API sources failed for '{code}'")

    # ===== 500.com SSQ (HTML parsing) =====
    def fetch_500com_ssq(self, count):
        url = f"https://datachart.500.com/ssq/history/newinc/history.php?limit={count}&sort=0"
        try:
            req = urllib.request.Request(url, headers={
                **HEADERS,
                'Referer': 'https://datachart.500.com/ssq/'
            })
            with urllib.request.urlopen(req, timeout=15, context=ssl_ctx) as response:
                html = response.read().decode('utf-8', errors='replace')

            rows = []
            tr_pattern = re.compile(r'<tr class="t_tr1"[^>]*>(.*?)</tr>', re.DOTALL)
            td_pattern = re.compile(r'<td[^>]*>(.*?)</td>', re.DOTALL)

            for tr_match in tr_pattern.finditer(html):
                tds = td_pattern.findall(tr_match.group(1))
                clean = [re.sub(r'<[^>]+>', '', td).strip().replace('&nbsp;', '') for td in tds]

                if len(clean) < 9:
                    continue

                period = clean[1]
                red_balls = [int(clean[i]) for i in range(2, 8) if clean[i].isdigit()]
                blue_ball = int(clean[8]) if clean[8].isdigit() else None

                date_str = ''
                for td in reversed(clean):
                    if re.match(r'20\d{2}-\d{2}-\d{2}', td):
                        date_str = td
                        break

                if len(red_balls) == 6 and blue_ball is not None:
                    rows.append({
                        'period': period,
                        'date': date_str,
                        'main': sorted(red_balls),
                        'bonus': [blue_ball],
                        'source': '500.com'
                    })

            if rows:
                sys.stderr.write(f"[API] 500.com/ssq: got {len(rows)} records\n")
                return {'rows': rows, 'source': '500.com', 'total': len(rows)}

        except Exception as e:
            sys.stderr.write(f"[API] 500.com/ssq failed: {e}\n")
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
                    # PL5 uses lotteryUnsortDrawresult (unsorted=original order)
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
        """Fetch FC3D from kaijiang.zhcw.com, paginate if needed"""
        rows = []
        per_page = 30  # zhcw shows ~30 per page
        pages_needed = min((count // per_page) + 1, 7)  # max 7 pages = 210 records

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

                    # Extract digits from the number cell
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
        """Fetch QLC from kaijiang.zhcw.com, paginate if needed"""
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

                    # QLC: 7 basic + 1 special number
                    # Numbers are in tds[2] formatted with whitespace
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

    # ===== 开彩网 (fallback) =====
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
        print(f"   SSQ → 500.com | DLT/PL3/PL5 → sporttery.cn | FC3D/QLC → zhcw.com")
        print(f"   Ctrl+C 停止\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n服务已停止")


if __name__ == "__main__":
    main()
