const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

// Replace 'YOUR_BOT_TOKEN' with your actual Telegram bot token
const bot = new TelegramBot('YOUR_BOT_TOKEN', { polling: true });

// Initialize SQLite database
const db = new sqlite3.Database('./users.db', (err) => {
  if (err) {
    console.error('Error opening database', err);
  } else {
    console.log('Database connected');
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      number TEXT
    )`);
  }
});

/* ----- DB Queries ----- */
// Function to check if a user exists in the database
function userExists(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row); // If the user exists, it will return a row
      }
    });
  });
}

// Function to create a new user only if they don't exist
async function createUser(user) {
  const userInDb = await userExists(user.id);
  return new Promise((resolve, reject) => {
    if (!userInDb) {
      // Insert user if they don't exist
      db.run('INSERT INTO users (id, number) VALUES (?, ?)', [user.id, user.number], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    } else {
      // If the user already exists, resolve with a message
      resolve('User already exists.');
    }
  });
}

function updateUser(id, update) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET number = ? WHERE id = ?', [update.number, id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes);
      }
    });
  });
}

function userDb(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

/* ----- Algeria Telecom API function ----- */
async function responseData(chatMe) {
  const parts = chatMe.split(":");
  const number = parts[0];
  const password = parts[1];

  const data = {
    "nd": number,
    "password": password
  };

  try {
    const response = await axios.post('https://mobile-pre.at.dz/api/auth/login', data);

    if (response.status === 200) {
      const json_data = response.data;
      const { nom: fname, prenom: lname, email, nd: nd_number, type: types, mobile } = json_data.data.original;
      const token = json_data.meta_data.original.token;
      const infos = ` 
• FullName: ${fname} ${lname} 
• Email: ${email}
• LandLine Number: ${nd_number} 
• Mobile Number: ${mobile}
      `;

      const headers = {
        'accept': 'application/json',
        'accept-encoding': 'gzip',
        'authorization': `Bearer ${token}`
      };

      const dataNew = {
        "nd": number,
        "type": "ADSL"
      };

      const day4 = await axios.post('https://mobile-pre.at.dz/api/rechargeSecours', dataNew, { headers });

      const resp = day4.data;
      const codeResp = resp.code;
      let reply = "";

      if (codeResp === '00') {
        reply = `${infos}\n<blockquote data-entity-type="MessageEntityBlockquote"><strong>✅ تم تفعيل الخدمة 96 ساعة بنجاح</strong></blockquote>`;
      } else {
        reply = `${infos}\n<blockquote data-entity-type="MessageEntityBlockquote"><strong>☑️ تم تفعيل الخدمة 96 ساعة سابقا</strong></blockquote>`;
      }

      return reply;
    } else {
      console.log("Login failed. Status code:", response.status);
      return "خطأ في معلومات تسجيل الدخول ";
    }
  } catch (error) {
    console.error("Error in POST request:", error);
    return "خطأ في معلومات تسجيل الدخول ";
  }
}

/* ----- Message Template with HTML Formatting ----- */
const msgDev = `
<blockquote data-entity-type="MessageEntityBlockquote"><strong>🤖 بوت خاص بالتعبئة الإحتياطية لإتصالات الجزائر</strong></blockquote>\n
استفد من إعادة تفعيل اشتراككم في خدمة الأنترنت Idoom ADSL أو Idoom Fibre لمدة 96 ساعة إضافية  🎉\n
قم بإدخال رقم الهاتف وكلمة المرور الخاصة بحسابك على هذا الشكل:\n
<blockquote data-entity-type="MessageEntityBlockquote"><strong> مثال: 033357799:12345678 </strong></blockquote>\n
اذا كنت لا تملك حسابا اضغط هنا: <a href="https://client.at.dz/ar/inscription">انشاء حساب جديد</a>
`;
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text;

  const user = await userDb(chatId);

  if (messageText.startsWith('/start')) {
    // Check if the user exists and only create if not
    await createUser({ id: chatId, number: '1' });
    bot.sendMessage(chatId, msgDev, {
      parse_mode: 'HTML', // Enable HTML formatting in the message
      reply_markup: {
        inline_keyboard: [
          [{ text: "Dev Account 💻", url: "https://t.me/hax18" }]
        ]
      }
    });
  } else if (messageText.includes(':')) {
    const res = await responseData(messageText);
    await updateUser(chatId, { number: messageText });
    const user2 = await userDb(chatId);
    bot.sendMessage(chatId, res, {
      parse_mode: 'HTML', // Enable HTML formatting in the message
      reply_markup: {
        keyboard: [[{ text: "اعادة الشحن🔄" }]],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    });
  } 
  else if (messageText === "اعادة الشحن🔄") {
    bot.sendMessage(chatId, "جاري العمل ...");
    const user2 = await userDb(chatId);
    if (user2 && user2.number) {
      const res = await responseData(user2.number);
      bot.sendMessage(chatId, res, {
        parse_mode: 'HTML', // Enable HTML formatting in the message
        reply_markup: {
          keyboard: [[{ text: "اعادة الشحن🔄" }]],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      });
    } 
    else {
      bot.sendMessage(chatId, "لم يتم العثور على حساب محفوظ. يرجى رقم الهاتف وكلمة المرور الخاصة بحسابك مرة أخرى.");
    }
  } else{
    bot.sendMessage(chatId, 'رجاء قم بإدخال رقم الهاتف وكلمة المرور الخاصة بحسابك على هذا الشكل: 033357799:12345678');
  }
});

// Start the bot
bot.on('polling_error', (error) => {
  console.log(error);
});

console.log('Bot is running...');
