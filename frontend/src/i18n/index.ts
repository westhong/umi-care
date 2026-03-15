// UmiCare i18n — zh / en
// Ported from index.html T object

type LangStrings = Record<string, string | ((...args: unknown[]) => string)>;

const zh: LangStrings = {
  appTitle: 'UmiCare 🐾',
  todayLabel: '今日',
  calendarLabel: '日曆',
  progressLabel: '完成',
  todayCare: '今日照護',
  todayTasks: '今日任務',
  progressCount: (d: unknown, total: unknown) => `${d} / ${total} 完成`,
  quickReportTitle: '⚡ 主動回報',
  incidentBtn: '🤢 嘔吐 / 異常狀況',
  feedReportBtn: '🍽️ 餵食紀錄',
  todayTasksTitle: '📋 今日任務',
  yesterdayTasksTitle: '📋 昨日補做',
  welcomeTitle: '歡迎使用 UmiCare',
  adminModeTitle: '🛠️ 管理員模式',
  logoutBtn: '🚪 登出',
  loadingSummary: '正在載入照護摘要…',
  tabOverview: '📊 今日概覽',
  tabPeriodic: '✨ 特殊任務',
  tabRecords: '📋 歷史紀錄',
  tabWeights: '⚖️ 體重',
  tabTasks: '✏️ 任務排程',
  tabCat: '🐾 貓咪&設定',
  calendarTitle: '📅 日曆',
  toastSaved: '✅ 已儲存',
  toastError: '❌ 發生錯誤',
  toastNetwork: '⚠️ 無法連線至伺服器，請檢查網路',
  statusDone: '✅ 完成',
  statusSkip: '⏭️ 略過',
  statusPending: '待完成',
  statusOverdue: '⚠️ 逾時',
  doneBtn: '✅ 完成',
  skipBtn: '⏭️ 略過',
  submitBtn: '✅ 確認提交',
  cancelBtn: '取消',
  allDoneMsg: '🎉 所有任務已完成！',
  noTasks: '目前沒有任務',
  loadFail: '⚠️ 載入資料失敗',
  catSaved: '✅ 貓咪資料已儲存',
  catSaveFail: '❌ 儲存失敗',
  pinAdminMode: '✅ 管理員模式',
  adminLogout: '👋 已登出管理員模式',
};

const en: LangStrings = {
  appTitle: 'UmiCare 🐾',
  todayLabel: 'Today',
  calendarLabel: 'Calendar',
  progressLabel: 'Done',
  todayCare: "Today's Care",
  todayTasks: "Today's Tasks",
  progressCount: (d: unknown, total: unknown) => `${d} / ${total} done`,
  quickReportTitle: '⚡ Quick Report',
  incidentBtn: '🤢 Vomit / Abnormal',
  feedReportBtn: '🍽️ Feeding Log',
  todayTasksTitle: "📋 Today's Tasks",
  yesterdayTasksTitle: '📋 Yesterday (Make-up)',
  welcomeTitle: 'Welcome to UmiCare',
  adminModeTitle: '🛠️ Admin Mode',
  logoutBtn: '🚪 Logout',
  loadingSummary: 'Loading care summary…',
  tabOverview: '📊 Overview',
  tabPeriodic: '✨ Special Tasks',
  tabRecords: '📋 History',
  tabWeights: '⚖️ Weight',
  tabTasks: '✏️ Task Schedule',
  tabCat: '🐾 Cat & Settings',
  calendarTitle: '📅 Calendar',
  toastSaved: '✅ Saved',
  toastError: '❌ An error occurred',
  toastNetwork: '⚠️ Cannot connect to server',
  statusDone: '✅ Done',
  statusSkip: '⏭️ Skipped',
  statusPending: 'Pending',
  statusOverdue: '⚠️ Overdue',
  doneBtn: '✅ Done',
  skipBtn: '⏭️ Skip',
  submitBtn: '✅ Submit',
  cancelBtn: 'Cancel',
  allDoneMsg: '🎉 All tasks done!',
  noTasks: 'No tasks',
  loadFail: '⚠️ Failed to load data',
  catSaved: '✅ Cat info saved',
  catSaveFail: '❌ Save failed',
  pinAdminMode: '✅ Admin Mode',
  adminLogout: '👋 Logged out of Admin Mode',
};

const translations: Record<string, LangStrings> = { zh, en };

export function useT(lang: 'zh' | 'en') {
  return function t(key: string, ...args: unknown[]): string {
    const val = (translations[lang] || translations.zh)[key];
    if (typeof val === 'function') return val(...args) as string;
    return (val as string) ?? key;
  };
}
