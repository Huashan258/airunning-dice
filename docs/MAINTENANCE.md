# 维护说明

## 模块边界

engine.mjs负责随机与规则，index.mjs负责确定性指令，catalogue.mjs负责共享NPC与称呼匹配，theatre.mjs负责多角色模拟、文档记忆与好感，scripts.mjs负责剧本及记忆门控，store.mjs提供锁和原子状态写入，public是宿主提供的工作台。

## 数据协议

trpg-dice.json的npcCatalog保存共享背景/别名；theatres保存各群启停、模拟设置、好感及短上下文；players按群与真实QQ隔离。.nn改变当前角色名，发送者身份仍用UID核验。

trpg-scripts.json维护active、ended、memoryGates。已暂停/结束/待命名的剧本不能让NPC读取或保存动态记忆；无剧本的.log off也能显式暂停。读到损坏状态时记忆门控失败关闭。

## .log off与编辑

NPC生成前不注入旧文档、历史或好感，提交前再次核对门控；在途带旧记忆的回复被取消。管理界面仍可读取/修改文档，replaceMemory先备份再替换，并清除短期上下文；恢复on后采用修改的内容。

## 测试与发布

npm test使用临时目录与固定骰源，覆盖权限、跨群隔离、暗骰不泄露、多NPC覆盖检查、称呼、暂停读写与编辑备份。宿主另测发送回执、DSH设置桥接和暂停后的入站/出站。发布只允许dice-plugin源码、测试、README、维护文档、LICENSE和package.json；严禁上传运行目录及个人HANDOVER。


消息以 ** 开头表示玩家与KP场外交流，NPC不回应、不读取为剧情、不写入记忆；剧本仍保存原文并标记ooc。只有开头匹配，正文中间的星号不影响剧情。


## v1.1.0 完整剧本阅读

宿主提供/script-reader.html与对应HTTP接口。进行中和归档均可完整分页、全文查找、下载；临时隐藏指定角色、KP或**注释，不改变原文和记忆。新NPC回复通过sendGroup(text,{scriptTurns})传递公开npc/reply，宿主应随实际回执保存，并处理自身回声提前到达；参数是可选的，原发送回调仍兼容。

入口与接口契约见[剧本阅读维护说明](SCRIPT_READER.md)，更新见[CHANGELOG](../CHANGELOG.md)。独立插件不提供QQ连接和HTTP服务，页面由AI宿主集成。
