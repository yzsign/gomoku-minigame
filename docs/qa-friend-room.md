# 好友房与观战：手工点验清单

端到端覆盖：开房 → 分享 → 第二人进房 → 对弈 → 第三好友观战 → 换机发券连 WebSocket。  
后端迁移与实现见 **`wxcloudrun-gomoku`**：至少执行 `migration-v36`（若用称号）与 **`migration-v37-friend-watch-token.sql`**（好友观战票落库、多实例一致）。

---

## 预备

- [ ] 数据库已执行上述迁移（未执行 v37 时，观战发券与多实例 WS 鉴权易失败）。
- [ ] 准备三个可登录身份（或三台设备）：A 开房、B 进房、C 观战。
- [ ] 小程序与 API **同一环境**；`GOMOKU_API_BASE` 配置正确。
- [ ] A、B、C 均能完成会话登录（带 `sessionToken` / `Authorization`）。

---

## 1. 开房

| 步骤 | 操作 | 预期 | 通过 |
|------|------|------|------|
| 1.1 | A 在首页开 **好友房**（非残局、非随机匹配） | 进入对局页，本方为黑，状态为等待白方/好友 | [ ] |
| 1.2 | 抓包或日志确认开房 `POST` 成功 | 返回 `roomId`、黑方 `blackToken` 等 | [ ] |
| 1.3 | 在第二人**未**进房、双方未同时在座时 | 不应对本方判读秒终局/无理和棋/超时负；与「对局未开始」一致 | [ ] |

**异常时**：查服务端 `random_match` 为好友房、时钟同步 `syncFriendRoomClockPauseForLiveSeats` 是否在广播 `STATE` 前执行。

---

## 2. 分享

| 步骤 | 操作 | 预期 | 通过 |
|------|------|------|------|
| 2.1 | A 点分享，把对局发给 B | 分享路径/参数含进房所需 `roomId`（与当前实现一致） | [ ] |
| 2.2 | B 从分享冷启动或半屏进入 | 先完成登录再 `join`；不长期卡在「未登录」 | [ ] |
| 2.3 | 分享取消或 B 未进入时 | A 仍为等待，不误判对方逃跑/终局 | [ ] |

---

## 3. 第二人进房

| 步骤 | 操作 | 预期 | 通过 |
|------|------|------|------|
| 3.1 | B 从分享进房，或通过房号/加入流程 | `POST /api/rooms/join?roomId=` 成功，获得白方 token / 执子色为白 | [ ] |
| 3.2 | A、B 双方 Gomoku WebSocket `onOpen` | 首条或后续 `STATE` 中 `blackConnected`、`whiteConnected` 均为 true | [ ] |
| 3.3 | 双方已入座后 | 读秒/局时**开始**计；不再拦截为「对局未开始」 | [ ] |

**异常时**：查 `join` 是否 200、WS `token` 是否为**座位 token** 而非观战票。

---

## 4. 两人下棋

| 步骤 | 操作 | 预期 | 通过 |
|------|------|------|------|
| 4.1 | 黑、白各至少下一步 | 盘面与 `STATE` 一致，无 `ERROR` 落子 | [ ] |
| 4.2 | 观战读秒/顶栏/头像环 | 与当前行棋方、执子色一致 | [ ] |
| 4.3 | 一方切后台再回 Front | 可重连，不按「单方断线即负」误结算（以产品规则为准） | [ ] |
| 4.4 | 悔棋/和棋（若开放） | `pending` 与双端表现一致 | [ ] |

---

## 5. 第三好友观战

| 步骤 | 操作 | 预期 | 通过 |
|------|------|------|------|
| 5.1 | C 在好友列表对 **正在对局中的 A 或 B** 点 **观战** | `POST /api/rooms/friend-watch?peerUserId=` 返回 200，body 含 `roomId` 与 `watchToken` | [ ] |
| 5.2 | 客户端用 `watchToken` 建 Gomoku WS（`roomId` + `token=watchToken` + `sessionToken`） | 连接成功，收到 `STATE`；`spectator: true`；棋盘与对局一致 | [ ] |
| 5.3 | C 为观战身份 | 不能落子；底栏/操作为观战态（与 `onlineSpectatorMode` 一致） | [ ] |
| 5.4 | 对局内「观战人数」与 `GET /api/rooms/{roomId}/spectators` | 人数与列表合理（含本人观战时列表补全等逻辑） | [ ] |
| 5.5 | 一名好友 C 已观战时，另一好友 D 再点观战 | 两人**均可**连接（**不应**再出现全房单槽「观战位已有」；仅**同账号重复连接**可拒绝） | [ ] |

**异常时**：

- `NOT_IN_GAME` / 404：查被点好友在 `GomokuPlayerPresenceRegistry` 中是否在局；是否误入**残局房**（接口层对 `PUZZLE_NOT_SUPPORTED`）。
- `PUZZLE_NOT_SUPPORTED`：当前好友列表观战不适用于残局好友房，属预期。

---

## 6. 换机发券连 WebSocket（多实例）

| 步骤 | 操作 | 预期 | 通过 |
|------|------|------|------|
| 6.1 | 确认生产/预发至少**两实例**或能模拟：HTTP 与 WS 打在不同节点 | 已部署含 `friend_watch_token` 的代码与 v37 迁移 | [ ] |
| 6.2 | 在**机 1**（或打中实例 A）上 C 发券：`POST /api/rooms/friend-watch` 成功 | 记下 `roomId`、`watchToken`；DB 中 `room_participants.friend_watch_token` 有值 | [ ] |
| 6.3 | 在**机 2**（或只从 DB 冷启的另一实例 B）上，仅用 `roomId` + 该 `watchToken` + 合法会话建 WS | 鉴权通过，持续收到与对局一致的 `STATE` | [ ] |
| 6.4 | 若报 `token 无效` 而 DB 有 `friend_watch_token` | 查该实例 `getRoom` → `buildRoomFromParticipant` 是否读入 `friendWatchToken`；是否混跑旧镜像 | [ ] |

---

## 7. 回归

- [ ] 对局进行中再进观战，不挤占黑白座位、不顶掉对弈连接。
- [ ] 对局结束后点观战：应 `GAME_OVER` 或「好友不在可观看对局中」，与产品一致。
- [ ] 观战方关小程序后重进：可再次 `friend-watch` 拿票，WS 能连。

---

## 抓包/日志要点

| 场景 | 关注 |
|------|------|
| HTTP | 开房、join、friend-watch 的 URL、状态码、JSON  body |
| WS 首包 `STATE` | `type`、`roomId`、`blackConnected`、`whiteConnected`、`spectator`、`clockPaused`、`puzzleRoom`、`spectatorCount` |
| 数据库 | `room_participants.random_match`、`friend_watch_token`；必要时 `room_game_state` 内 `friendBothHumanSeatsLiveOnce` |

---

## 相关代码与配置（索引）

- 小程序：`app.startOnlineAsHost`、`app.startOnlineFriendWatchFromPeer`（`js/main/gameLogic/part2.js`），好友列表面板（`js/main/gameLogic/friendListHome.js`）。
- 房间 API：`js/roomApi.js`；WebSocket 基址与 `GOMOKU_API_BASE` 一致。
- 后端：`RoomController`（`/api/rooms/friend-watch`、`/{roomId}/spectators`），`GomokuWebSocketHandler`（`friendWatch` 分支），`RoomService.ensureFriendWatchTokenInMemoryAndDb`，SQL `migration-v37-friend-watch-token.sql`。
