# 数据逻辑核查记录

核查日期：2026-10-16。以下是公开文档与站点结构核查，不是对某个账号、产品或数据授权的确认。

## iFinD 官方数据接口

- [官方 HTTP 示例](https://quantapi.51ifind.com/gwstatic/static/ds_web/quantapi-web/example.html#http接口应用案例-python环境)：已读取。明确展示 get_access_token、refresh_token 请求头、access_token 请求头、date_sequence、basic_data_service、cmd_history_quotation。代码中的固定地址和鉴权方向与此示例对照。
- [官方权限说明](https://quantapi.51ifind.com/gwstatic/static/ds_web/quantapi-web/help-center/permission.html)：已读取。存在免费版，说明免费账号可使用 iFinD 账号登录；不能据此断言本账号具备某一理财净值指标或商用展示权限。
- [官方 Windows 接口包下载入口](https://quantapi.51ifind.com/gwstatic/static/ds_web/quantapi-web/download.html)。根据官方 HTTP 示例，获取 refresh_token 需解压 Windows 接口包，打开“超级命令 → 工具 → refresh_token 查询”。应仅在本机或环境安全设置填写，不发送聊天。
- 用户提供的客户端账号密码没有被写入仓库、日志或工具命令；当前没有安全注入的 API Token，因此尚未执行账户授权查询。
- 官方示例为通用证券数据，不能把股票收盘价字段当作银行理财净值字段。真正理财指标和登记编码映射需在账号官方指标查询工具中确认。

## 理财公开披露

- [中国理财网产品查询](https://www.chinawealth.com.cn/lcweb/management/proScreen)：页面可访问。公开前端产品查询流程包含验证码验证，不绕过验证码，未批量获取产品列表。
- [统一披露平台上线公告](https://www.chinawealth.com.cn/lc_zxgg/202609/t20260903_855384072.html)：已读取，官方标题“理财行业统一信息披露平台9月1日全面上线运行”。正文指向 [理财行业统一信息披露平台](https://xinxipilu.chinawealth.com.cn/queryMenu/selectedProducts)。平台子域当前尚未成功访问，不能称其具体产品数据已取得。
- 首页及公告不是某只理财产品的原文证据。真实分析应匹配登记编码、发行机构、产品全称、份额类别、币种、报告期和文件版本。
- 站点页脚声明非商业目的自身使用；实际对外提供数据、批量采集或再分发前需确认相应授权。当前工具仅供本机单用户研究，不公开再发布取得的原文全文。

## 当前能力与剩余环节

|能力|结果|
|---|---|
|公开文档读取|iFinD 官方HTTP示例、权限页、中国理财网公告已取得|
|原文读取连接器|本机实现，HTML/文本、robots、白名单、限频、大小限制|
|账号API权限|未验证：未安全配置官方Token|
|真实理财指标字段|未确认：待官方代码生成器与授权响应核对|
|自动搜索产品|尚未实现：公开列表有验证码，统一平台访问未成功|
|净值计算和评分|已实现并用合成数据及独立公式基准测试|
|真实产品综合评分|尚未生成；没有伪造真实产品、净值或原文证据|

公开文档核查只证明连接器设计与文档相符，不代替真实接口调用、账号授权或文件真实性验证。
