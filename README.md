# wall

Surge 规则仓库。首批内容为 2026-09-27 整理的微博去广告和 fmz200 广告拦截合集，兼容目标为 Surge Mac 5.7.6。

## 文件

| 文件 | 内容 | 引用策略 |
| --- | --- | --- |
| [weibo.domainset](Surge/domain-set/weibo.domainset) | 30 条域名及域名后缀 | REJECT |
| [weibo.list](Surge/rule-set/weibo.list) | 2 条 URL 拦截 | REJECT |
| [blockAds-01.domainset](Surge/domain-set/blockAds-01.domainset) | 1389 条域名及域名后缀 | REJECT |
| [blockAds-01.list](Surge/rule-set/blockAds-01.list) | 95 条其他规则 | REJECT |
| [blockAds-02.list](Surge/rule-set/blockAds-02.list) | 13 条静默丢弃规则 | REJECT-DROP |
| [blockAds-03.domainset](Surge/domain-set/blockAds-03.domainset) | 1284 条域名及域名后缀 | REJECT |
| [blockAds-03.list](Surge/rule-set/blockAds-03.list) | 109 条其他规则 | REJECT |

广告合集按原始策略连续段分为 01、02、03，引用时保留这个顺序。只在同一策略段内去重，不跨策略合并。DOMAIN-SET 中的 `example.com` 精确匹配，`.example.com` 匹配根域名及子域名。RULE-SET 内不写策略，保留 `no-resolve` 等规则参数。

## 主配置引用

将以下内容放在 `[Rule]` 段靠前位置，位于可能提前放行的规则及 `FINAL` 之前：

```ini
DOMAIN-SET,https://raw.githubusercontent.com/iceloon/wall/main/Surge/domain-set/blockAds-01.domainset,REJECT
RULE-SET,https://raw.githubusercontent.com/iceloon/wall/main/Surge/rule-set/blockAds-01.list,REJECT
RULE-SET,https://raw.githubusercontent.com/iceloon/wall/main/Surge/rule-set/blockAds-02.list,REJECT-DROP
DOMAIN-SET,https://raw.githubusercontent.com/iceloon/wall/main/Surge/domain-set/blockAds-03.domainset,REJECT
RULE-SET,https://raw.githubusercontent.com/iceloon/wall/main/Surge/rule-set/blockAds-03.list,REJECT
DOMAIN-SET,https://raw.githubusercontent.com/iceloon/wall/main/Surge/domain-set/weibo.domainset,REJECT
RULE-SET,https://raw.githubusercontent.com/iceloon/wall/main/Surge/rule-set/weibo.list,REJECT
```

[Wall.example.conf](Surge/Profiles/Wall.example.conf) 是不含个人信息的规则引用示例；它使用 `FINAL,DIRECT`，没有代理节点，也没有响应脚本，不是个人完整配置。

## 响应改写与脚本

DOMAIN-SET / RULE-SET 只决定请求使用什么策略，不能修改响应内容。信息流广告过滤仍依赖 URL Rewrite、Map Local、Script 和 MITM。对应的可选模块为：

- [微博模块](https://raw.githubusercontent.com/iceloon/wall/main/Surge/module/weibo.sgmodule)
- [广告合集模块](https://raw.githubusercontent.com/iceloon/wall/main/Surge/module/blockAds.sgmodule)

模块已改为引用本仓库的域名表和综合规则表，JavaScript 继续使用原作者的远程 `script-path`。若主配置已包含对应响应配置段，就不要再重复安装模块。

本次另生成了仅保存在本地 iCloud 的 `DIY-Wall-RuleSets.conf`。它保留已有代理、证书、微博和广告响应处理配置，将个人分流的大段规则移至同目录下的 `DIY-Wall-RuleSets/routing/`。这些私人文件不在本仓库；复制这份个人配置时应同时复制旁边的目录。原个人分流的顺序和已有远程订阅引用保留，新配置没有应用或切换。

## 兼容性与验证范围

- Mac 5.7.6 支持普通 Body Rewrite，不支持 JQ Body Rewrite。上游 79 条 JQ 和 1 条语法不完整的替换未启用，见 [排除明细](sources/blockAds-excluded-rules.json)。这不是完整等价转换。
- 酷安链接跳转脚本含顶层 `return`，已在兼容快照和模块中注释停用。
- 普通 Body Rewrite 要求 Surge iOS 5.10.0 或以上。iOS 需要单独启用 MITM 并信任 CA；共享配置不会自动完成证书信任。
- 本次验证包括规则拆分测试、源规则与输出内容对照、参数保留、文件引用检查和公开文件检查。新个人配置尚未加载运行，也没有逐应用验证广告效果。
- 本仓库规则是快照，不会自动抓取 fmz200 后续变更。Surge 会缓存远程规则和脚本，修改仓库后需等待资源更新或手动更新。

运行拆分测试与仓库检查：

```sh
node --test tools/rules.test.mjs
node tools/verify.mjs
```

构建工具需要显式提供私人基线配置、当前配置、上游模块、兼容快照和仓库外的新配置路径：

```sh
node tools/build.mjs BASELINE.conf CURRENT.conf UPSTREAM.sgmodule COMPAT.sgmodule NEW_PROFILE.conf
```

工具专用于本次快照结构，遇到基线边界变化会停止；不会覆盖已有的新配置或修改当前配置。

## 来源与许可

- [fmz200/wool_scripts](https://github.com/fmz200/wool_scripts)：Loon 广告合集和对应 Surge 模块。
- [iceloon/wool_scripts](https://github.com/iceloon/wool_scripts)：此前整理的微博配置；脚本作者信息保留在各远程资源中。
- [sources](sources/) 保存公开源文件和兼容快照，不含个人代理、订阅凭据或 CA 私钥。

遵循上游 GPL-3.0 许可，见 [LICENSE](LICENSE)。远程脚本由原作者维护，适用其各自许可。
