chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-quote-quieter",
    title: "Save as quote to Quieter",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "save-quote-quieter" && info.selectionText) {
    const rawText = info.selectionText.trim();
    if (!rawText) return;

    const sourceTitle = (tab && tab.title) ? tab.title.trim() : "Web Clipping";
    const data = await chrome.storage.local.get({ quotes: [] });
    const quotes = Array.isArray(data.quotes) ? data.quotes : [];

    quotes.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: rawText,
      author: sourceTitle,
      tag: "collected",
      category: "web-clip",
      favorite: false,
      createdAt: Date.now()
    });

    await chrome.storage.local.set({ quotes });
  }
});
