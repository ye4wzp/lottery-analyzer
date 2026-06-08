# lottery-analyzer

彩票数据分析大师是一个本地运行的彩票走势与统计分析页面，支持双色球、大乐透、福彩 3D、七乐彩、排列三、排列五等彩种。

## 功能

- 最新开奖与历史期数展示
- 号码频率、遗漏、组合、形态等统计分析
- Chart.js 图表展示
- 多数据源 API 代理，降低浏览器 CORS 影响
- 推荐号码导出为 CSV、TXT 或图片

## 本地运行

直接打开 `index.html` 可以查看静态页面。需要拉取真实开奖数据时，运行本地代理服务：

```bash
python3 server.py
```

然后访问：

```text
http://localhost:8899
```

## 可选配置

`server.py` 默认会优先使用公开数据源，并在需要时尝试 MXNZP 作为兜底数据源。MXNZP 凭据通过环境变量配置：

```bash
cp .env.example .env
set -a
source .env
set +a
python3 server.py
```

不要把 `.env` 或真实 API 凭据提交到仓库。

## 声明

本项目只做数据展示和统计分析，不提供中奖承诺。彩票具有随机性，请理性参与。
