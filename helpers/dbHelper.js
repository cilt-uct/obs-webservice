import fs from 'fs';
import sql from 'mysql';
import { dbConfiguration } from '../constants';

const pool = sql.createPool({
  connectionLimit: 50,
             host: dbConfiguration.hostname,
             user: dbConfiguration.username,
         password: dbConfiguration.password,
         database: dbConfiguration.database
});

/**
 * Create SQLite3 table Subscription.
 */
export function createDatabase() {
  const dbExists = fs.existsSync(dbFile);
  const db = new sqlite3.Database(dbFile);
  const createSubscriptionStatement =
    'CREATE TABLE Subscription (' +
    'UserId TEXT NOT NULL, ' +
    'SubscriptionId TEXT NOT NULL, ' +
    'AccessToken TEXT NOT NULL, ' +
    'Resource TEXT NOT NULL, ' +
    'ChangeType TEXT NOT NULL, ' +
    'ClientState TEXT NOT NULL, ' +
    'NotificationUrl TEXT NOT NULL, ' +
    'SubscriptionExpirationDateTime TEXT NOT NULL' +
    ')';

  db.serialize(() => {
    if (!dbExists) {
      db.run(
        createSubscriptionStatement,
        [],
        error => {
          if (error !== null) throw error;
        }
      );
    }
  });
  db.close();
}
/*
export function getSubscription(subscriptionId, callback) {
  const db = new sqlite3.Database(dbFile);
  const getUserDataStatement =
    'SELECT ' +
    'UserId as userId, ' +
    'SubscriptionId as subscriptionId, ' +
    'AccessToken as accessToken, ' +
    'Resource as resource, ' +
    'ChangeType as changeType, ' +
    'ClientState as clientState, ' +
    'NotificationUrl as notificationUrl, ' +
    'SubscriptionExpirationDateTime as subscriptionExpirationDateTime ' +
    'FROM Subscription ' +
    'WHERE SubscriptionId = $subscriptionId ' +
    'AND SubscriptionExpirationDateTime > datetime(\'now\')';

  db.serialize(() => {
    db.get(
      getUserDataStatement,
      {
        $subscriptionId: subscriptionId
      },
      callback
    );
  });
}*/
export function getSubscription(subscriptionId) {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        return reject(err);
      }

      let query = 'select A.*, B.token as accessToken from subscriptions A join tokens B on A.account = B.account where A.expiration_date > now()' + (!!subscriptionId ? ' and A.id = ?' : '') + ' order by A.expiration_date desc, B.expiration_date desc';
      let values = [];
      if (subscriptionId) values.push(subscriptionId);
      connection.query(query, values, (e, result) => {
        if (e) {
          return reject(e);
        }

        if (result.length === 0) {
          return reject('no active subscriptions');
        }
        resolve(result[0]);
      });

      connection.release();
    });
  });
}

export function saveSubscription(subscriptionData) {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        return reject(err);
      }

      let timestamp = (new Date((new Date(subscriptionData.expirationDateTime)).getTime() - (new Date()).getTimezoneOffset() * 60 * 1000)).toISOString().replace('T', ' ').replace('Z', '');
      let values = [
        subscriptionData.applicationId,
        subscriptionData.creatorId,
        subscriptionData.id,
        subscriptionData.resource,
        subscriptionData.changeType,
        subscriptionData.clientState,
        subscriptionData.notificationUrl,
        subscriptionData.userId || null,
        subscriptionData.accessToken || null,
        timestamp,
        timestamp,
        subscriptionData.id,
        subscriptionData.accessToken
      ];

      connection.query(
        "insert into subscriptions (application_id, creator_id, id, resource, change_type, client_state, notification_url, account, " +
        "access_token, expiration_date) values (?,?,?,?,?,?,?,?,?,?) on duplicate key update expiration_date = ?, id = ?, access_token = ?",
        values, qErr => {
          if (qErr) {
            return reject(qErr);
          }

          resolve();
        });

      connection.release();
    });
  });
}
/*
export function saveSubscription(subscriptionData, callback) {
  const db = new sqlite3.Database(dbFile);
  const insertStatement =
    'INSERT INTO Subscription ' +
    '(UserId, SubscriptionId, AccessToken, Resource, ChangeType, ' +
    'ClientState, NotificationUrl, SubscriptionExpirationDateTime) ' +
    'VALUES ($userId, $subscriptionId, $accessToken, $resource, $changeType, ' +
    '$clientState, $notificationUrl, $subscriptionExpirationDateTime)';

  db.serialize(() => {
    db.run(
      insertStatement,
      {
        $userId: subscriptionData.userId,
        $subscriptionId: subscriptionData.id,
        $accessToken: subscriptionData.accessToken,
        $resource: subscriptionData.resource,
        $clientState: subscriptionData.clientState,
        $changeType: subscriptionData.changeType,
        $notificationUrl: subscriptionData.notificationUrl,
        $subscriptionExpirationDateTime: subscriptionData.expirationDateTime
      },
      callback
    );
  });
}
*/


export function deleteSubscription(subscriptionId, callback) {
  const db = new sqlite3.Database(dbFile);
  const deleteStatement =
    'DELETE FROM Subscription WHERE ' +
    'SubscriptionId = $subscriptionId';

  db.serialize(() => {
    db.run(
      deleteStatement,
      { $subscriptionId: subscriptionId },
      callback
    );
  });
}

export function getAccessToken() {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        return reject(err);
      }

      connection.query('select * from tokens', (e, result) => {
        if (e) {
          return reject(e);
        }

        resolve(result[0]);
      });

      connection.release();
    });
  });
}

export function saveAccessToken(tokenData) {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        return reject(err);
      }

      let values = [
        tokenData.accessToken,
        tokenData.expiresOn,
        tokenData.userId,
        null,
        JSON.stringify(tokenData),
        tokenData.refreshToken,
        tokenData.accessToken,
        tokenData.expiresOn,
        tokenData.userId,
        null,
        JSON.stringify(tokenData),
        tokenData.refreshToken
      ];
      connection.query("insert into tokens (token, expiration_date, authorisation_date, account, address, last_payload, refresh_token) " +
                       "values (?, ?, now(), ?, ?, ?, ?) on duplicate key update token = ?, expiration_date = ?, authorisation_date = now(), " +
                       "account = ?, address =?, last_payload = ?, refresh_token = ?", values, (qErr) => {
        if (qErr) {
          return reject(qErr);
        }

        resolve();
      });

      connection.release();
    });
  });
}

export function saveFromRefreshToken(tokenData) {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        return reject(err);
      }

      let base64payload = (tokenData.access_token.split('.'))[1];
      let payload = JSON.parse(new Buffer(base64payload, 'base64').toString('binary'));
      let values = [
        tokenData.access_token,
        tokenData.refresh_token,
        new Date((payload.exp - (new Date()).getTimezoneOffset() * 60) * 1000).toISOString().replace('T', ' ').replace('Z', ''),
        payload.upn
      ];

      connection.query("update tokens set token = ?, refresh_token = ?, expiration_date = ? where account = ?", values, (qErr) => {
        if (qErr) {
          console.log(qErr);
          console.log('some sql error');
          return reject(qErr);
        }

        resolve();
      });

      connection.release();
    });
  });
}

export function saveMeetingDetails(details) {
}
