const { YTLiveChatManager } = require('../../lib/youtubeAPI');
const { listenChats, listenChatsSpecificVideo } = require('./chat.functions');
const { youtubeChats } = require('../../db');

class YouTubeChatService {
  constructor(app) {
    this.app = app;
    listenChats(app);
  }

  async get(id) {
    const result = await listenChatsSpecificVideo(id, this.app);
    return {
      message: result || 'OK',
    };
  }

  async find() {
    const ids = [...YTLiveChatManager.liveChatListeners.keys()];
    const messages = await youtubeChats.find({
      live_chat_id: {
        $in: ids
      }
    });
    return messages;
  }

  async create({ message, item, user }) {
    const created = await youtubeChats.findOneAndUpdate(
      {
        id: item.id,
      },
      {
        $set: message,
      },
      {
        upsert: true,
      }
    );
    created.user = user;
    return [created];
  }

  async patch(id, updates) {
    const updated = await youtubeChats.findOneAndUpdate(
      {
        id,
      },
      {
        $set: updates,
      },
      {
        upsert: true,
      }
    );
    return updated;
  }
}

module.exports = YouTubeChatService;
