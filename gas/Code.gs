/**
 * TS Online: Three Kingdoms Tower Defense (TS THAMMAI)
 * Google Apps Script Web App Entry Point & Google Sheets Integration
 *
 * Compatible with direct Web App URL and Google Sites iframe embedding.
 * Zero server-side game loop calls: all Canvas rendering, physics, combat,
 * sound synthesis, assets, and LocalStorage saves run client-side.
 * Google Sheets calls occur strictly on explicit user Sign-In, Post-Match Save,
 * and Leaderboard view/refresh actions.
 */

const SPREADSHEET_ID = '1j-Aly0TQRGrXRSjs8Ckwqu4N270ec5Im7r3ejEkmaUs';
const PLAYERS_SHEET_NAME = 'Players';
const SCORES_SHEET_NAME = 'Scores';

const PLAYERS_HEADERS = ['Timestamp', 'PlayerName', 'Email', 'Platform', 'LastActive'];
const SCORES_HEADERS = [
  'Timestamp',
  'PlayerName',
  'Email',
  'MapId',
  'MapNameTH',
  'Score',
  'Rank',
  'Victory',
  'WaveReached',
  'TotalWaves',
  'EnemiesKilled',
  'BossesDefeated',
  'TimePlayedSec',
];

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('TS THAMMAI : Three Kingdoms Tower Defense')
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
    )
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Helper for modular HTML template includes (if using HtmlService.createTemplateFromFile)
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getGasActiveEmail_() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (err) {
    return '';
  }
}

function ensureSheetAndHeader_(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getGasSessionInfo() {
  return {
    ok: true,
    email: getGasActiveEmail_(),
  };
}

function registerPlayerToSheet(payload) {
  try {
    var cleanName = payload && payload.playerName ? String(payload.playerName).trim() : '';
    if (!cleanName) {
      return { ok: false, error: 'กรุณากรอกชื่อผู้เข้าเล่นก่อนลงทะเบียน' };
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sheet = ensureSheetAndHeader_(ss, PLAYERS_SHEET_NAME, PLAYERS_HEADERS);
      var nowIso = new Date().toISOString();
      var email = getGasActiveEmail_() || '-';
      sheet.appendRow([nowIso, cleanName, email, 'GOOGLE_APPS_SCRIPT', nowIso]);
      return {
        ok: true,
        message: 'ลงชื่อผู้เล่น "' + cleanName + '" ลง Google Sheet เรียบร้อยแล้ว',
      };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : 'ไม่สามารถบันทึกการลงชื่อผู้เล่นได้',
    };
  }
}

function saveScoreToSheet(payload) {
  try {
    var cleanName = payload && payload.playerName ? String(payload.playerName).trim() : '';
    if (!cleanName) {
      return { ok: false, error: 'กรุณาระบุชื่อผู้เล่นก่อนบันทึกคะแนน' };
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sheet = ensureSheetAndHeader_(ss, SCORES_SHEET_NAME, SCORES_HEADERS);
      var nowIso = new Date().toISOString();
      var email = getGasActiveEmail_() || '-';
      var row = [
        nowIso,
        cleanName,
        email,
        String(payload.mapId || ''),
        String(payload.mapNameTH || ''),
        Number(payload.score) || 0,
        String(payload.rank || 'D'),
        payload.victory ? 'VICTORY' : 'DEFEAT',
        Number(payload.waveReached) || 0,
        Number(payload.totalWaves) || 0,
        Number(payload.enemiesKilled) || 0,
        Number(payload.bossesDefeated) || 0,
        Number(payload.timePlayedSec) || 0,
      ];
      sheet.appendRow(row);
      return {
        ok: true,
        message: 'บันทึกคะแนน ' + (Number(payload.score) || 0) + ' ของ "' + cleanName + '" สำเร็จ!',
      };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : 'ไม่สามารถบันทึกคะแนนลง Google Sheet ได้',
    };
  }
}

function getLeaderboardFromSheet(mapIdFilter) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SCORES_SHEET_NAME);
    if (!sheet || sheet.getLastRow() <= 1) {
      return { ok: true, entries: [] };
    }
    var lastRow = sheet.getLastRow();
    var values = sheet.getRange(2, 1, lastRow - 1, SCORES_HEADERS.length).getValues();
    var filter = mapIdFilter ? String(mapIdFilter) : 'ALL';
    var entries = [];

    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var playerName = String(row[1] || '').trim();
      if (!playerName) continue;
      var mapId = String(row[3] || '').trim();
      if (filter !== 'ALL' && mapId !== filter) continue;

      var tsVal = row[0] instanceof Date ? row[0].toISOString() : String(row[0] || '');
      var victoryRaw = String(row[7] || '').trim().toUpperCase();
      entries.push({
        id: 'gas_row_' + i + '_' + tsVal,
        timestamp: tsVal,
        playerName: playerName,
        email: String(row[2] || ''),
        mapId: mapId,
        mapNameTH: String(row[4] || mapId),
        score: Number(row[5]) || 0,
        rank: String(row[6] || 'D').trim().toUpperCase(),
        victory: victoryRaw === 'VICTORY' || victoryRaw === 'TRUE' || victoryRaw === 'ชนะ',
        waveReached: Number(row[8]) || 0,
        totalWaves: Number(row[9]) || 0,
        enemiesKilled: Number(row[10]) || 0,
        bossesDefeated: Number(row[11]) || 0,
        timePlayedSec: Number(row[12]) || 0,
      });
    }

    entries.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.victory !== b.victory) return a.victory ? -1 : 1;
      if (b.waveReached !== a.waveReached) return b.waveReached - a.waveReached;
      return String(b.timestamp).localeCompare(String(a.timestamp));
    });

    return {
      ok: true,
      entries: entries.slice(0, 100),
    };
  } catch (err) {
    return {
      ok: false,
      entries: [],
      error: err && err.message ? err.message : 'ไม่สามารถโหลดตารางอันดับคะแนนจากชีทได้',
    };
  }
}
