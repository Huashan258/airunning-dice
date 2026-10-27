# airunning-dice

独立的MIT跑团骰子与NPC插件。Node.js 22+，零第三方依赖。只发布源码和测试，不含QQ连接程序、模型凭据、真人聊天、人物卡、NPC私有背景、音频或剧本。

## 使用

```sh
npm test
node dice-plugin/cli.mjs "4d6kh3"
```

提供程序随机骰点、CoC检定/暗骰、角色卡与SAN、KP记录、全群共享NPC资料、多角色互动、独立启停与文档记忆、好感及剧本归档。NPC称呼玩家采用当前角色卡.nn名字。

群内常用命令：.r、.ra、.rh、.st、.nn、.sc、.kp、.npc use/stop NPC名或all、人格模拟：【行动】、.log on/off/end/name。骰点不由模型决定；暗骰只私聊。NPC背景、别名可通过宿主工作台维护。

## 接入AI宿主

公开AI宿主：https://github.com/Huashan258/bili-whale-qq-public

AI仓库以子模块固定本插件版本，推荐git clone --recurse-submodules。已有本地部署可将本仓库克隆为AI宿主相邻的airunning目录。宿主负责OneBot通道、权限、模型、限频与HTTP接口，插件不另起QQ连接。

核心入口：dice-plugin/index.mjs(createDicePlugin)、theatre.mjs(createTheatre)、scripts.mjs(createScripts)。宿主必须向createTheatre传入memoryAllowed回调，使用scriptMemoryAllowed关联剧本状态。

## 数据与维护

运行状态放.data，NPC文档放npc-memory，未完成剧本放beginscript，结束放endscript，全部不提交Git。NPC角色库全群共享，启停、好感和剧情记忆按群独立；多人模拟会核对所有参与角色。

.log off停止NPC读取/保存聊天文档、模拟历史和动态好感；背景仍可用于无记忆模拟；.log on命名后恢复。工作台可以查看、编辑、清空记忆，操作前自动备份。结束剧本保存本群聊天和人物属性快照。

参见[维护说明](docs/MAINTENANCE.md)。骰子写法参考海豹官方手册常用规则，自行实现常用子集，不包含海豹引擎，也不宣称完整兼容。


消息以 ** 开头表示玩家与KP场外交流，NPC不回应、不读取为剧情、不写入记忆；剧本仍保存原文并标记ooc。只有开头匹配，正文中间的星号不影响剧情。
