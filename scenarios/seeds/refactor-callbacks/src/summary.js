import fs from 'node:fs';
import path from 'node:path';

// 사용자별 결제 합계를 팀 이름과 함께 돌려준다. (콜백 방식)
export function buildSummary(dir, cb) {
  fs.readFile(path.join(dir, 'users.json'), 'utf8', (err, usersText) => {
    if (err) return cb(err);
    fs.readFile(path.join(dir, 'payments.json'), 'utf8', (err2, payText) => {
      if (err2) return cb(err2);
      fs.readFile(path.join(dir, 'teams.json'), 'utf8', (err3, teamText) => {
        if (err3) return cb(err3);
        let users, pays, teams;
        try {
          users = JSON.parse(usersText);
          pays = JSON.parse(payText);
          teams = JSON.parse(teamText);
        } catch (e) {
          return cb(e);
        }
        const out = users.map((u) => ({
          name: u.name,
          team: teams[u.team] ?? '미정',
          total: pays.filter((p) => p.userId === u.id).reduce((s, p) => s + p.amount, 0),
        }));
        cb(null, out);
      });
    });
  });
}
