import axios from 'axios';
// Lấy từ GitHub Secrets
const BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TWITTER_USERNAME = process.env.TWITTER_USERNAME;
// Lưu ID bài đã gửi (để tránh gửi lại)
const LAST_ID_FILE = 'last-tweet-id.txt';
async function getLastTweetId() {
  try {
    const res = await axios.get(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/contents/${LAST_ID_FILE}`, {
      headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` }
    });
    return atob(res.data.content).trim();
  } catch (e) {
    return null;
  }
}
async function updateLastTweetId(id) {
  const content = btoa(id);
  try {
    const res = await axios.get(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/contents/${LAST_ID_FILE}`, {
      headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` }
    });
    await axios.put(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/contents/${LAST_ID_FILE}`, {
      message: 'Update last tweet ID',
      content: content,
      sha: res.data.sha,
      branch: 'main'
    }, {
      headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` }
    });
  } catch (e) {
    await axios.put(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/contents/${LAST_ID_FILE}`, {
      message: 'Create last tweet ID',
      content: content,
      branch: 'main'
    }, {
      headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` }
    });
  }
}
// Dịch sang tiếng Việt (Google Translate miễn phí)
async function translateToVietnamese(text) {
  try {
    const response = await axios.get(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(text)}`
    );
    return response.data[0][0][0];
  } catch (error) {
    console.error('Lỗi dịch:', error.message);
    return text;
  }
}
// Lấy bài viết mới nhất với media
async function getLatestTweets() {
  const url = `https://api.twitter.com/2/users/by/username/${TWITTER_USERNAME}`;
  const userRes = await axios.get(url, {
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` }
  });
  const userId = userRes.data.data.id;
  const tweetsUrl = `https://api.twitter.com/2/users/${userId}/tweets?max_results=10&expansions=attachments.media_keys&media.fields=type,url&tweet.fields=attachments,created_at`;
  const tweetsRes = await axios.get(tweetsUrl, {
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` }
  });
  return { data: tweetsRes.data.data || [], includes: tweetsRes.data.includes || {} };
}
async function sendToTelegram(message, photoUrl = null) {
  const telegramUrl = photoUrl 
    ? `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`
    : `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const payload = photoUrl 
    ? { chat_id: TELEGRAM_CHAT_ID, photo: photoUrl, caption: message, parse_mode: 'HTML', disable_web_page_preview: false }
    : { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML', disable_web_page_preview: true };
  await axios.post(telegramUrl, payload);
}
async function main() {
  try {
    const lastId = await getLastTweetId();
    const lastBigId = lastId ? BigInt(lastId) : null;
    const { data: tweets, includes } = await getLatestTweets();
    // Lọc bài mới + bắt đầu bằng "Binance Alpha"
    const targetTweets = tweets.filter(t =>
      (!lastBigId || BigInt(t.id) > lastBigId) &&
      t.text.trim().startsWith('Binance Alpha')
    );
    if (targetTweets.length === 0) {
      console.log('Không có bài mới nào bắt đầu bằng "Binance Alpha".');
      return;
    }
    // Lấy bài đầu tiên (mới nhất)
    const tweet = targetTweets[0];
    const originalText = tweet.text;
    const translatedText = await translateToVietnamese(originalText);
    const tweetUrl = `https://x.com/${TWITTER_USERNAME}/status/${tweet.id}`;
    const message = `
<b>Binance Alpha Alert</b>
${translatedText}
 <a href="${tweetUrl}">Xem trên X</a>
    `.trim();
    // Tìm ảnh nếu có (lấy ảnh đầu tiên nếu type='photo')
    let photoUrl = null;
    if (tweet.attachments && tweet.attachments.media_keys && tweet.attachments.media_keys.length > 0) {
      const mediaKey = tweet.attachments.media_keys[0];
      const media = includes.media.find(m => m.media_key === mediaKey);
      if (media && media.type === 'photo' && media.url) {
        photoUrl = media.url;
      }
    }
    await sendToTelegram(message, photoUrl);
    await updateLastTweetId(tweet.id); // Cập nhật ID đã gửi
    console.log('Đã gửi bài Binance Alpha mới nhất!');
  } catch (error) {
    console.error('Lỗi:', error.response?.data || error.message);
  }
}
main();
