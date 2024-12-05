chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// chrome.tabs.onActivated.addListener((activeInfo) => {
//   loadPageContent(activeInfo.tabId);
// });
// chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
//   if (changeInfo.status == 'complete' && tab.active) {
//     loadPageContent(tabId);
//   }
// });