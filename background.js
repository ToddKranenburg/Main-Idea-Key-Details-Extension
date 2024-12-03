chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.tabs.onActivated.addListener((activeInfo) => {
  loadPageContent(activeInfo.tabId);
});
chrome.tabs.onUpdated.addListener(async (tabId) => {
  loadPageContent(tabId);
});

async function loadPageContent(tabId) {
  console.log('Flag: initiate load content for tab:', tabId);

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !tab.url.startsWith('http')) {
      console.warn('Invalid tab URL:', tab.url);
      return;
    }

    const injection = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['scripts/extract-content.js']
    });

    const content = injection[0]?.result || '';
    if (!content) {
      console.error('No content extracted from the page.');
      return;
    }

    console.log('Extracted content:', content);

    // Store the content
    await chrome.storage.session.set({ pageContent: content });
  } catch (error) {
    console.error('Error in loadPageContent:', error);
  }
}
