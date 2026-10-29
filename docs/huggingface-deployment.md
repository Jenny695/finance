# Hugging Face Spaces 免费体验部署

目标：自己电脑关机后，别人仍可通过平台网址打开网页。使用平台当前提供的免费CPU Docker资源，不承诺永久免费、永不休眠或账号免验证；注册与硬件价格以当前页面为准。免费本地磁盘不持久，重建/迁移等操作可能丢失注册账号、导入目录和报告；需要长期保存时应另行使用持久数据库/存储。

## 第一步：创建Space

1. 打开 https://huggingface.co/join 注册并完成平台要求的邮箱验证，已有账号直接登录。
2. 打开 https://huggingface.co/new-space 。
3. Owner选择自己的账号，Space name填写 `zhiheng-finance`。
4. Space SDK选择 **Docker**，Docker模板选择 **Blank**；不要选Static或Gradio。
5. 硬件选择页面标明免费的 **CPU basic**（以实际费用标示为准），可见性选择 **Public**。
6. 创建Space。没有Dockerfile时暂时无法构建是正常的，接着完成下面步骤。如果免费创建也要求无法完成的付款验证，先停止，不要误选收费硬件。

## 第二步：只上传部署文件

在Space的Files页添加两个根目录文件：

- 仓库 `deploy/huggingface/Dockerfile` 保存为Space根目录的 **Dockerfile**。
- 仓库 `deploy/huggingface/README.md` 保存为Space根目录的 **README.md**。如果创建Space已生成README，可保留其余元数据，但必须有 `sdk: docker`、`app_port: 7860`。

无需上传整个项目。这个Dockerfile构建时会下载公开GitHub仓库main分支源码，安装依赖并构建网页。它不会读取Windows的`.env`、数据库或`import-files`。仅上传Dockerfile而不配置凭据也能先构建，但管理员和真实行情需下一步配置。

不要将整个Windows项目文件夹拖到Public Space，避免把本机凭据或账号数据库上传到公开文件区。Public Space的源文件是公开的。

## 第三步：在Settings里设置Variables和Secrets

在Space Settings找到Variables and secrets。填写：

| 类型 | 名称 | 内容 |
|---|---|---|
| Variable | ADMIN_USERNAME | finance_admin |
| Secret | ADMIN_PASSWORD | 自己设置并保管的至少12位密码 |
| Secret | IFIND_REFRESH_TOKEN | 自己的有效Refresh Token；暂不接数据可以先不填 |
| Variable（可选） | USER_DAILY_QUERY_LIMIT | 1000 |
| Variable（可选） | TOTAL_DAILY_QUERY_LIMIT | 1000 |

不要把Token当成普通Variable或写进Dockerfile、README和GitHub。网站在服务端使用凭据，普通注册用户不填Token。

平台提供`SPACE_HOST`时，网站自动使用正确HTTPS域名。若启动日志提示缺少HTTPS地址，添加Variable `PUBLIC_URL`，内容为平台提供的真实 **https://…hf.space** 网址，不是 `https://huggingface.co/spaces/账号/名称` 的管理页地址。不要猜测域名，复制平台实际生成的地址。

## 第四步：打开网站

等待Build及启动完成，平台状态为Running后，使用App菜单的“在新窗口打开”或直接访问平台提供的 `https://…hf.space` 地址。

网站禁止被第三方页面嵌入，且登录使用安全Cookie；因此Space管理页里的内嵌App可能显示拒绝连接，直接在独立标签页打开hf.space地址即可，不要通过放宽登录保护解决嵌入问题。

用finance_admin和设置的密码登录。管理员导入准备用于网站的目录后，其他人可以自行注册并查询；也可不导入目录直接按代码分析。不会自动把Windows现有账号和数据库搬到公开Space。

分享直接hf.space网址。Windows电脑可关闭，平台会负责运行。免费实例休眠后首次访问可能需要等待唤醒，重建可能清空本地数据。

## 更新与错误

- GitHub源码变化不会自动触发另一个平台的Space部署。需要更新时在Space重新构建，必要时使用平台的Factory rebuild；重建前导出需要保留的研究报告。
- 此Dockerfile从GitHub下载源码，需要平台构建网络能访问GitHub和npm；失败时查看Build logs，不能把源码未下载成功当成同花顺授权错误。
- 同花顺接口在本机可用，不代表每个托管地区都能连接或有相同授权条件。真实查询仍需在实际Space验证。
- 免费版不是持久保存大众用户数据的最终上线方案，不要承诺重建后账号仍在。
