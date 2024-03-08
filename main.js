'use strict';
require('dotenv').config();
const { google } = require('googleapis');
const _ = require('lodash');
const puppeteer = require('puppeteer');
const { setTimeout } = require('timers/promises');
const { IncomingWebhook } = require('@slack/webhook');

(async () => {
  //スプシ認証
  const authorize = () => {
    const email = process.env.CLIENT_EMAIL;
    console.log(email);
    const privateKey = _.replace(process.env.PRIVATE_KEY, /\\n/g, '\n');
    const scope = ['https://www.googleapis.com/auth/spreadsheets'];
    const jsonWebToken = new google.auth.JWT(email, null, privateKey, scope, null);

    jsonWebToken.authorize((err, tokens) => {
      if (err) {
        console.log(err);
        return;
      } else {
        console.log('Authorized!');
      }
    });
    return google.sheets({ version: 'v4', auth: jsonWebToken });
  };

  //MF打刻
  const mfPuppeteer = async () => {
    try {
      const browser = await puppeteer.launch({
        // headless: false, //ブラウザ起動
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process'],
      });
      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
      );
      await page.goto('https://attendance.moneyforward.com/employee_session/new', {
        waitUntil: ['load', 'networkidle2'],
      });
      // await setTimeout(Math.floor(Math.random() * 600000))//打刻時間をバラけさせる

      const [login1] = await page.$x('//a[contains(text(), "IDでログイン")]');
      await login1.click();
      console.log('ページ遷移');
      await setTimeout(10000);
      await page.type('input[type="email"]', process.env.MF_ID);
      const login2 = await page.$('#submitto');
      await login2.click();
      await setTimeout(10000);
      console.log('パスワード画面');
      await page.type('input[type="password"]', process.env.MF_PASSWORD);
      const login3 = await page.$('#submitto');
      await login3.click();
      console.log('ログイン完了');
      await setTimeout(10000);

      // let clickButtonType = 'in'
      const date = new Date().getMonth() + '月' + new Date().getDate() + '日' + new Date().getHours() + '時 ';
      // console.log(date)
      let message = date;
      // slack_icon必要
      // let slack_icon = 'https://icooon-mono.com/i/icon_12426/icon_124261_64.png'
      // slack_icon = 'https://static.vecteezy.com/system/resources/previews/000/512/293/large_2x/vector-close-glyph-black-icon.jpg'

      await setTimeout(10000);
      //HEROKU UTC am9時以降 = 日本18時以降（退勤）
      if (new Date().getHours() > 9) {
        const [button] = await page.$x('//button[contains(text(), "退勤")]');
        await button.click();
      } else {
        const [button] = await page.$x('//button[contains(text(), "出勤")]');
        await button.click();
      }
      console.log(message, '打刻完了');
      await setTimeout(10000);
      console.log('終了');

      //Slack通知
      // const webhook = new IncomingWebhook(process.env.SLACK_HOOK_URL);
      // webhook.send({
      // text: message,//'退勤'or'出勤'
      //   username: "MF勤怠", //通知のユーザー名
      //   icon_url: slack_icon,
      // });
      await browser.close();
    } catch (error) {
      //スクレイピング失敗時のslack通知
      const webhook = new IncomingWebhook(process.env.SLACK_HOOK_URL);
      webhook.send({
        text: '<!channel>\n打刻失敗：\n' + error,
        username: 'MF勤怠',
        icon_url: 'https://thumb.ac-illust.com/90/90bae316d037441107ac7354f53f991c_t.jpeg',
      });
    }
  };

  try {
    console.log('-----開始-----', new Date().getHours());
    const sheets = authorize();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'A1',
    });
    console.log('本日の勤務：', res.data.values[0]); //スプシのA1
    if (res.data.values[0] == '出社' || res.data.values[0] == 'リモート') {
      mfPuppeteer();
    } else {
      console.log('今日は休日');
    }
  } catch (error) {
    console.log('The API returned an error: ' + error);
    //Slack通知
    const webhook = new IncomingWebhook(process.env.SLACK_HOOK_URL);
    webhook.send({
      text: '<!channel>\n打刻失敗：\n' + error,
      username: 'MF勤怠', //通知のユーザー名
      icon_url: 'https://thumb.ac-illust.com/90/90bae316d037441107ac7354f53f991c_t.jpeg',
    });
  }
})();
