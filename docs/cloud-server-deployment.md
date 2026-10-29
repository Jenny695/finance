# 独立云服务器部署（电脑关机后仍可访问）

适用：无法绑定 Render 付款卡，希望使用国内云平台付款方式。可选择腾讯云轻量应用服务器或阿里云同类服务器；是否支持支付宝/微信、当前价格及地区，以平台结算页为准。服务器和自有域名通常分别收费。此配置没有替你创建服务器或产生费用。

## 1. 准备服务器与域名

建议配置：香港或新加坡地区，Ubuntu 24.04 LTS、x86_64、2核2GB内存、40GB系统盘起。选择普通系统镜像即可，不需要另外安装数据库或购买付费面板。

准备自己的域名，并添加 `finance` 子域名的 A 记录指向服务器公网 IPv4。例如拥有 `your-domain.example`，则网站地址是 `https://finance.your-domain.example`（这里是示例，不能直接使用）。已有域名也可以直接使用。域名解析生效前不要开始申请 HTTPS 证书。

云平台防火墙/安全组放行入站 TCP 80、443；SSH 22 用于远程连接和上传，按需要限制到自己的 IP。不要开放应用端口3000、数据库端口或Docker管理接口。

## 2. 在云平台浏览器终端安装运行工具

下面命令在云服务器 Linux 终端执行，不是在 Windows 的 cmd 中执行：

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 git
sudo systemctl enable --now docker
git clone https://github.com/Jenny695/finance.git
cd finance
cp deploy/server.env.example .env.production
nano .env.production
```

只编辑服务器上的 `.env.production`：

- `SITE_HOST`：真实域名，例如 `finance.你的域名`，不带协议或路径。
- `ADMIN_USERNAME`：`finance_admin`。
- `ADMIN_PASSWORD`：自己保存的管理员密码。
- `IFIND_REFRESH_TOKEN`：自己的有效 Refresh Token。留空也能先使用登录页面，但无法获取新行情。
- 查询上限按实际需求配置；它们是本平台的请求计数，不会改变同花顺官方额度。

nano 保存：Ctrl+O、回车，退出：Ctrl+X。不要在聊天或截图中展示这个文件。

```bash
chmod 600 .env.production
mkdir -p runtime-data runtime-caddy/data runtime-caddy/config
```

## 3. 迁移现有账号与产品目录（可选，首次上线前进行）

如果要保留 Windows 当前网站账号、目录和报告：

1. 在 Windows 网站后台窗口按 Ctrl+C 停止服务，确保 SQLite 文件复制期间不再写入。
2. 使用云平台文件上传工具或 WinSCP，把原项目 `.public-data` **里面的全部内容**上传到服务器项目的 `runtime-data`，包括存在的 `-wal`、`-shm` 文件。不要只复制 finance.sqlite；accounts.sqlite 保存账号，market-data.sqlite 保存共享行情。
3. 不要把整个 `.local` 当作公网账号库，不要把数据库上传到 GitHub。
4. 在服务器执行下一步的权限修正后启动。

如果不迁移，服务器会创建空数据库，管理员仍由环境配置创建；普通用户需要重新注册，产品目录需要管理员导入一次。导入目录文件可以上传到独立目录备用，不要公开到静态页面。

## 4. 启动

```bash
sudo chown -R 1000:1000 runtime-data
sudo docker compose --env-file .env.production config --quiet
sudo docker compose --env-file .env.production up -d --build
sudo docker compose --env-file .env.production ps
```

首次构建需下载 Node、安装依赖并编译网页。`app` 健康后，`web` 启动；Caddy会为真实域名申请并自动续期HTTPS证书。申请需要域名正确解析且公网能访问80/443，不能只填IP地址或旧trycloudflare网址代替域名。

浏览器打开自己的 `https://真实域名`，验证普通账号注册登录、产品查询、对比。成功后即可分享这个地址。Docker以后台模式运行，关闭Windows或云平台终端不会关闭服务。服务器重启后Docker及容器自动启动；云服务器欠费、停机或网络异常仍会影响访问。

不要执行 `docker compose config` 的非 quiet 版本后把完整输出发到聊天，环境配置可能包含凭据。

## 5. 更新与备份

更新：

```bash
git pull --ff-only
sudo docker compose --env-file .env.production up -d --build
```

源码与运行数据分开，更新不会主动删除 `runtime-data`。不要把运行数据目录删掉或重新上传旧数据库覆盖它。

备份时先停止写入服务，再在云平台下载 `runtime-data` 整个目录和妥善保管环境配置；下载完成后启动服务：

```bash
sudo docker compose --env-file .env.production stop app
# 此时下载 runtime-data 全部文件；环境配置单独保密保存。
sudo docker compose --env-file .env.production up -d
```

排错仅查看必要日志：

```bash
sudo docker compose --env-file .env.production logs --tail=60 app web
```

发截图前遮住账号个人信息和凭据。此配置已校验Compose结构；没有真实服务器/域名时，不能把本机测试说成已完成公网HTTPS上线。
