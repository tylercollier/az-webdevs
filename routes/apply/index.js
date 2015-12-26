import express from 'express';
import _ from 'lodash';
import dotty from 'dotty';
import bug from 'debug';
import changeCase from 'change-case';
import validate from '../../lib/validate';
import rateLimit from '../../lib/rate-limit';
import slackApi from '../../lib/slack';
import { exitWithError, getStrings } from '../../lib/helpers';

const debug = bug('SIR:apply');
const router = express.Router();
const slackUrl = process.env.SLACK_WEBHOOK_URL;
const slack = slackUrl ? slackApi(slackUrl) : exitWithError('Please set SLACK_WEBHOOK_URL environment variable.');

const getUser = _.partialRight(dotty.get, 'session.passport.user');

router.get('/', validate, (req, res) => {
  const user = getUser(req);
  const strings = getStrings();

  strings.apply.form.fullName.value = user.displayName;
  strings.apply.form.email.value = user.emails[0].value;

  res.render('apply', _.assign({}, strings.apply, user));
});

router.post('/', validate, rateLimit(), (req, res) => {
  const user = getUser(req);
  const files = req.files;
  const renameJobs = [];

  debug('Received application from "%s <%s>"', user.displayName, user.emails[0].value);

  for (const field in files) {
    const fileObj = files[field];
    const tmpPath = fileObj.path;
    const filename = field + '-' + fileObj.name;
    const dest = __dirname + '/public/images/' + filename;

    _.assign(fileObj, {
      dest: dest,
      uri: req.originUri + '/images/' + filename
    });

    renameJobs.push(async.apply(mv, tmpPath, dest));

    async.parallel(renameJobs, (err) => {
      if (err) {
        error(err);
        return res.sendStatus(500);
      }

      res.redirect('/thanks');

      slack({
      channel: channel,
      username: botName,
      icon_url: req.originUri + 'images/bot.png',
      attachments: [
        {
          fallback: user.displayName + ' wants to join Slack',
          author_name: user.displayName,
          author_link: user.url,
          author_icon: dotty.get(user, 'image.url'),
          color: '#28f428',
          pretext: 'New invite request:',
          text: req.body.comments ? '"' + req.body.comments + '"' : undefined,
          fields: _.map(
            _.pairs(_.omit(req.body, 'comments')),
            _.flow(
              x => x,
              _.partialRight(_.map, (str, i) => {
                return i ? str : changeCase.title(str);
              }),
              _.partial(_.zipObject, ['title', 'value']),
              _.partialRight(_.assign, { short: true })
            )
          )
            .concat(_.map(files, (file) => ({
              title: file.fieldname,
              value: '<' + file.uri + '|View>',
              short: true
            })))
        }
      ]
    });
  });
}});

export default router;