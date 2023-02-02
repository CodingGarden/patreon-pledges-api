// @ts-check

const { sub } = require('date-fns');
const {
  twitchCommands,
  counter,
} = require('../../db');
const pronounChoices = require('../../lib/validPronounChoices');
const getCountries = require('../../lib/getCountries');
const { simpleIcons, fontAwesome } = require('../../lib/getIcons');

class TwitchCommandsService {
  constructor(app) {
    this.app = app;
  }

  async find(params) {
    const query = {
      deleted_at: {
        $eq: null,
      },
      created_at: {
        $gte: sub(new Date(), {
          hours: 6,
        }),
      },
      ack: {
        $ne: true,
      },
    };
    if (params.query) {
      if (params.query.commands === 'false' || params.query.commands === false) {
        query.message = {
          $regex: /^(?!\\!)\w+/,
        };
      }
      if (params.query.user_id) {
        query.user_id = params.query.user_id;
      }
      if (params.query.created_at) {
        query.created_at = params.query.created_at;
      }
    }
    const commands = await twitchCommands.find(query, {
      sort: {
        created_at: -1
      },
      limit: 1000,
    });
    return commands;
  }

  async remove(id) {
    await twitchCommands.update({ id }, { $set: { deleted_at: new Date() } });
    return id;
  }

  async patch(_id, updates) {
    const updated = await twitchCommands.findOneAndUpdate({
      _id,
    }, {
      $set: updates,
    }, {
      upsert: true,
    });
    return updated;
  }

  async create(message) {
    const user = await this.app.service('twitch/users').get(message.username);
    const archiveQuestion = message.message.match(/^!archive\s+#?(\d+)$/);
    if (archiveQuestion) {
      const num = +archiveQuestion[1];
      const question = await twitchCommands.findOne({
        num,
      });
      const isNotArchivedOrDeleted = question && !question.archived && !question.deleted_at;
      const isModOrOwner = !!(message.badges.moderator
        || message.badges.broadcaster
        || question.user_id === message.user_id);
      if (isNotArchivedOrDeleted && isModOrOwner) {
        await this.app.service('vox/populi').remove(question._id);
      }
    } else if (message.message.match(/^!(ask|idea|submit)/)) {
      const [, ...args] = message.message.split(' ');
      if (!args.join(' ').trim()) return;
      const count = await counter.findOneAndUpdate({
        name: 'question',
      }, {
        $inc: { value: 1 }
      }, {
        upsert: true,
      });
      message.num = count.value;
      const now = new Date();
      await this.app.service('twitch/users').patch(user.name, {
        last_seen: now,
      });
      user.last_seen = now;
    }
    const created = await twitchCommands.findOneAndUpdate({
      id: message.id,
    }, {
      $set: message,
    }, {
      upsert: true,
    });
    if (message.message.match(/^!here$/)) {
      const now = new Date();
      await this.app.service('twitch/users').patch(user.name, {
        last_seen: now,
      });
      user.last_seen = now;
    } else if (message.message.match(/^!setstatus /)) {
      // TODO: limit status length
      const args = (message.parsedMessage || message.message).split(' ');
      args.shift().slice(1);
      const status = args.join(' ');
      user.status = status;
      await this.app.service('twitch/users').patch(user.name, {
        status,
      });
    } else if (message.message.match(/^!clearstatus/)) {
      user.status = null;
      await this.app.service('twitch/users').patch(user.name, {
        status: null,
      });
    } else if (message.message.match(/^!(country|flag|team|team-color|team-colour|pronoun)/)) {
      const args = message.message.split(' ');
      const command = args.shift().slice(1);
      if (args.length === 0) return;
      if (command === 'country' || command === 'flag') {
        const countryLookup = args.shift().toLowerCase().trim();
        if (countryLookup === 'clear' || countryLookup === 'remove') {
          user.country = undefined;
          await this.app.service('twitch/users').patch(user.name, {
            country: undefined,
          });
        } else {
          const countries = await getCountries();
          const country = countries.get(countryLookup);
          if (country) {
            user.country = country;
            await this.app.service('twitch/users').patch(user.name, {
              country,
            });
          }
        }
      } else if (command === 'team') {
        const team = args.shift().toLowerCase().trim();
        if (team === 'clear' || team === 'remove') {
          user.team = undefined;
          await this.app.service('twitch/users').patch(user.name, {
            team: undefined,
          });
        } else if (fontAwesome.has(team) || simpleIcons.has(team)) {
          user.team = team;
          await this.app.service('twitch/users').patch(user.name, {
            team,
          });
        }
      } else if (command === 'team-color' || command === 'team-colour') {
        const color = args.shift().toLowerCase().trim().replace('#', '');
        if (color === 'clear' || color === 'remove') {
          user.team_color = undefined;
          await this.app.service('twitch/users').patch(user.name, {
            team_color: undefined,
          });
        } else if (color.match(/^(([a-f0-9]){3}){1,2}$/)) {
          user.team_color = color;
          await this.app.service('twitch/users').patch(user.name, {
            team_color: color,
          });
        }
      } else if (command === 'pronoun') {
        const pronoun = (args.shift() || '').toLowerCase().trim();
        if (pronoun === 'clear' || pronoun === 'remove') {
          user.pronoun = undefined;
          await this.app.service('twitch/users').patch(user.name, {
            pronoun: undefined,
          });
        } else if (pronounChoices.has(pronoun)) {
          user.pronoun = pronoun;
          await this.app.service('twitch/users').patch(user.name, {
            pronoun,
          });
        }
      }
    }
    created.user = user;
    return created;
  }
}

module.exports = TwitchCommandsService;
