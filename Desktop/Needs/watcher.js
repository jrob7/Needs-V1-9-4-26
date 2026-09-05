
import { MongoClient, ObjectId } from 'mongodb';
const MONGO_URL = process.env.MONGO_URL;
const API_URL = "https://needs-app-1-0.onrender.com";

async function searchUploadedItems(searchText, bidprice, urgency) {
  const url = `${API_URL}/searchResults?searchText=${encodeURIComponent(searchText)}&bidprice=${bidprice}&urgency=${urgency}`;
  const res = await fetch(url);
  return await res.json();
}

async function notifyUser(threadId, matches, searchText) {
  await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      role: "assistant",
      content: `🔔 New match found for **"${searchText}"**:\n\n` +
      matches.map(m => `• ${m.title} — $${m.bidprice}`).join("\n")
    })
  });
}

async function checkForMatches() {
  const client = await MongoClient.connect(MONGO_URL);
  const db = client.db("Need");

  const needRequests = await db.collection("NeedRequests").find().toArray();

  for (const need of needRequests) {
    const matches = await searchUploadedItems(need.searchText, need.bidprice, need.urgency);

    if (matches.length > (need.notifiedCount || 0)) {
      await notifyUser(need.threadId, matches, need.searchText);

      await db.collection("NeedRequests").updateOne(
        { _id: need._id },
        { $set: { notifiedCount: matches.length } }
      );
    }
  }

  client.close();
}

checkForMatches();