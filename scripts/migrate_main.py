# -*- coding: utf-8 -*-
"""Migrate js/main.js to app.* namespace; emit js/main/gameLogic.js + thin js/main.js."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAIN = ROOT / "js" / "main.js"

STATE_NAMES = [
    "historyListTouchStartY",
    "historyListTouchStartX",
    "historyScrollTouchId",
    "pieceSkinModalPendingIdx",
    "historyOppAvatarImgCache",
    "onlineUndoRequesterColor",
    "PIECE_SKIN_MODAL_ANIM_MS",
    "MATCH_HISTORY_STORAGE_KEY",
    "onlineSocketConnectGen",
    "randomMatchPairedPollTimer",
    "randomMatchHostCancelToken",
    "onlineOppProfileFetched",
    "onlineOppProfileRoomId",
    "PROFILE_PROMPT_STORAGE_KEY",
    "pieceSkinModalAnimRafId",
    "RANDOM_MATCH_PAIRED_POLL_MS",
    "RANDOM_MATCH_TIMEOUT_MS",
    "PEAK_ELO_STORAGE_KEY",
    "onlineBlackConnected",
    "onlineWhiteConnected",
    "onlineReconnectAttempt",
    "onlineReconnectTimer",
    "ONLINE_RECONNECT_MAX_MS",
    "ONLINE_RECONNECT_BASE_MS",
    "historyStatsSnapshot",
    "pieceSkinRedeemInFlight",
    "PIECE_SKIN_WEAR_DBL_MS",
    "pieceSkinWearDblAt",
    "pieceSkinWearDblIdx",
    "pieceSkinModalVisible",
    "MASCOT_SHEET_FRAME_COUNT",
    "homeUiAssetsLoadInFlight",
    "homeUiAssetsAppliedRev",
    "qingtaoLibaiPieceBlackImg",
    "qingtaoLibaiPieceWhiteImg",
    "tuanMoePieceBlackImg",
    "tuanMoePieceWhiteImg",
    "onlineOpponentIsBot",
    "onlineResultOverlaySticky",
    "lastSettledGameId",
    "lastSettleRating",
    "resultTuanPointsAnim",
    "resultTuanPointsRafId",
    "onlineInviteConsumed",
    "randomMatchHostWaiting",
    "homeMascotAnimTimer",
    "matchingAnimTimer",
    "historyListLoading",
    "historyTabLoading",
    "historyLoadStartTs",
    "historyServerItems",
    "historyPeakEloCached",
    "historyScrollLastY",
    "historyScrollVel",
    "historyScrollLastTs",
    "historyMomentumRafId",
    "historyMomentumLastTs",
    "historyScrollbarRatioSmooth",
    "HISTORY_SCROLLBAR_HOLD_MS",
    "historyScrollbarLastScrollTs",
    "historyScrollbarFadeTimerId",
    "historyFilterTab",
    "pieceSkinModalPage",
    "pieceSkinModalAnim",
    "MASCOT_SUBPKG_PREFIX",
    "HOME_SUBPACKAGE_NAME",
    "onlineOppFetchInFlight",
    "onlineOppAvatarImg",
    "onlineOppNickname",
    "myProfileAvatarFetched",
    "myNetworkAvatarImg",
    "homeDockCheckinImg",
    "homeDockHistoryImg",
    "homeDockSkinImg",
    "shopThemeMintBoardImg",
    "shopThemeInkBoardImg",
    "homeDockRankImg",
    "homeMascotSheetImg",
    "homePressedDockCol",
    "homePressedButton",
    "themeBubbleRafId",
    "themeBubbleAlpha",
    "themeBubbleText",
    "PIECE_SKIN_CARD_W_RPX",
    "checkinModalVisible",
    "checkinModalData",
    "checkinStateCache",
    "ratingFetchInFlight",
    "ratingCardVisible",
    "ratingCardData",
    "WIN_REVEAL_DELAY_MS",
    "winningLineCells",
    "winRevealTimerId",
    "showResultOverlay",
    "replayAutoTimerId",
    "onlineMoveHistory",
    "onlineMatchRound",
    "onlineSettleSent",
    "onlineWsEverOpened",
    "onlineWsConnected",
    "onlineOpponentLeft",
    "pvpOnlineYourColor",
    "onlineUndoPending",
    "FAKE_OPPONENT_NAMES",
    "lastOpponentMove",
    "aiMoveGeneration",
    "localUndoRequest",
    "localMoveHistory",
    "pveMoveHistory",
    "aiWorkerInstance",
    "LOCAL_NICKNAME_KEY",
    "CHECKIN_DAILY_POINTS",
    "myDisplayNameCache",
    "placeStoneAudio",
    "PIECE_SKIN_FONT_UI",
    "lastTouchDownX",
    "lastTouchDownY",
    "homeRatingEloCache",
    "historyScrollY",
    "matchHistoryList",
    "homeDrawerOpen",
    "replayMoves",
    "replayStep",
    "socketTask",
    "onlineRoomId",
    "onlineToken",
    "isPvpOnline",
    "isPvpLocal",
    "isRandomMatch",
    "pveHumanColor",
    "PVE_DIFF_LABEL",
    "randomOpponentName",
    "matchingTimer",
    "matchingDots",
    "homeMascotImg",
    "resultKind",
    "themeId",
    "pieceSkinId",
    "gameOver",
    "winner",
    "current",
    "lastMsg",
    "canvas",
    "board",
    "MASCOT_SHEET_FPS",
    "HOME_UI_ASSETS_REV",
    "aiWorkerSeq",
    "layout",
    "screen",
    "BLACK",
    "WHITE",
    "SIZE",
    "sys",
    "ctx",
    "H",
    "W",
    "DPR",
]

STATE_NAMES = sorted(set(STATE_NAMES), key=len, reverse=True)


def main():
    code = MAIN.read_text(encoding="utf-8")
    lines = code.splitlines()
    top_level_funcs = []
    for line in lines:
        m = re.match(r"^function (\w+)\s*\(", line)
        if m:
            top_level_funcs.append(m.group(1))
    top_level_funcs = list(dict.fromkeys(top_level_funcs))
    top_sorted = sorted(top_level_funcs, key=len, reverse=True)

    # 1) var state =
    for name in STATE_NAMES:
        code = re.sub(
            r"^var " + re.escape(name) + r"\s*=",
            "app." + name + " =",
            code,
            flags=re.MULTILINE,
        )

    # 2) identifiers -> app.name (not after dot)
    for name in STATE_NAMES:
        code = re.sub(
            r"(?<!\.)" + r"\b" + re.escape(name) + r"\b",
            "app." + name,
            code,
        )

    # 3) function name( -> app.name = function(
    for fn in top_level_funcs:
        code = re.sub(
            r"^function " + re.escape(fn) + r"\s*\(",
            "app." + fn + " = function(",
            code,
            flags=re.MULTILINE,
        )

    # 4) calls -> app.fn(  (avoid app.app.)
    for fn in top_sorted:
        code = re.sub(
            r"(?<!app\.)" + r"\b" + re.escape(fn) + r"\s*\(",
            "app." + fn + "(",
            code,
        )

    wrapper = (
        "/**\n * 游戏逻辑与 UI（由 scripts/migrate_main.py 自 main 迁移）\n */\n"
        "module.exports = function gameLogic(app, deps) {\n"
        "  var gomoku = deps.gomoku;\n"
        "  var render = deps.render;\n"
        "  var themes = deps.themes;\n"
        "  var doodles = deps.doodles;\n"
        "  var roomApi = deps.roomApi;\n"
        "  var authApi = deps.authApi;\n"
        "  var defaultAvatars = deps.defaultAvatars;\n"
        "  var ratingTitle = deps.ratingTitle;\n"
        "  var wx = deps.wx;\n\n"
    )
    footer = "\n};\n"

    # Strip original header requires (first 12 lines) from migrated body
    body_lines = code.splitlines()
    if len(body_lines) >= 12:
        body_lines = body_lines[12:]
    body = "\n".join(body_lines)

    # 局部变量 themeId 不能与全局 app.themeId 混淆（签到弹窗描边）
    body = body.replace(
        "var app.themeId = th.id || 'classic';",
        "var checkinShellThemeId = th.id || 'classic';",
    )
    body = body.replace(
        "app.themeId === 'ink'\n"
        "      ? 'rgba(255, 248, 240, 0.4)'",
        "checkinShellThemeId === 'ink'\n"
        "      ? 'rgba(255, 248, 240, 0.4)'",
    )

    # setInterval(foo, ms) 未变成 app.foo(，裸名 foo 在分包作用域下不存在
    body = re.sub(
        r"setInterval\(\s*pollRandomMatchPairedOnce\s*,",
        "setInterval(function () { app.pollRandomMatchPairedOnce(); },",
        body,
    )

    # 对象字面量键 board: 被误替换为 app.board:
    body = body.replace("app.board:", "board:")
    # 字符串字面量内的 'WHITE'|'BLACK' 勿加 app. 前缀
    for _sym in ("WHITE", "BLACK"):
        body = body.replace("'app." + _sym + "'", "'" + _sym + "'")

    # 勿用 main/gameLogic.js：与目录 main/gameLogic/ 冲突
    out = ROOT / "js" / "main" / "gameLogic.monolith.js"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(wrapper + body + footer, encoding="utf-8")
    print("Wrote", out, "chars", len(wrapper + body + footer))


if __name__ == "__main__":
    main()
