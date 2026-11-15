import { beforeEach, describe, expect, it } from 'vitest';
import { countD1RoundTrips } from '../test-d1-round-trips';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { LIST_TEAM_MEMBERS_SQL, listTeamMembers } from './teams';

// The team's member list (docs/specs/013-workspace/teams.md): each connected member's display name, and a joined
// member's picture (docs/specs/014-identity/profile-picture.md §5), read with the rows in one statement.

const PICTURE = 'https://lh3.googleusercontent.com/a?width=96&height=96&fit=crop';

let db: SqliteD1;

beforeEach(() => {
  db = sqliteD1();
  db.sql.exec(`
    INSERT INTO teams (id, name, created_at, updated_at) VALUES ('t1', 'Design', 1, 1);
    INSERT INTO team_members (id, team_id, user_id, email, role, status, created_at, updated_at) VALUES
      ('m1', 't1', 'user_ann', 'ann@x.test', 'admin', 'joined', 1, 1),
      ('m2', 't1', 'user_bob', 'bob@x.test', 'member', 'joined', 1, 1),
      ('m3', 't1', 'user_cy', 'cy@x.test', 'member', 'invited', 1, 1),
      ('m4', 't1', NULL, 'dee@x.test', 'member', 'invited', 1, 1),
      ('m5', 't1', 'user_eve', 'eve@x.test', 'member', 'joined', 1, 1);
    INSERT INTO participants (id, name, color, created_at, picture_url) VALUES
      ('user_ann', 'Ann', '#f00', 1, '${PICTURE}'),
      ('user_bob', 'Bob', '#0f0', 1, NULL),
      ('user_cy', 'Cy', '#00f', 1, '${PICTURE}');
  `);
});

describe('listTeamMembers', () => {
  it("names each connected member, and shows a joined member's picture only", async () => {
    const members = await listTeamMembers(db.env, 't1');
    expect(members.map((m) => [m.id, m.name, m.pictureUrl])).toEqual([
      ['m1', 'Ann', PICTURE],
      ['m2', 'Bob', null],
      ['m3', 'Cy', null],
      ['m4', null, null],
      ['m5', null, null],
    ]);
  });

  it('reads the whole list in one round trip, however many members', async () => {
    const trips = countD1RoundTrips(db.env);
    await listTeamMembers(db.env, 't1');
    expect(trips.trips).toHaveLength(1);
  });

  it("seeks the team's rows and each member's participant by key", () => {
    const plan = db.sql
      .prepare(`EXPLAIN QUERY PLAN ${LIST_TEAM_MEMBERS_SQL}`)
      .all('t1')
      .map((row) => String(row['detail']));
    expect(plan.join('\n')).toMatch(/SEARCH tm USING INDEX team_members_team/);
    expect(plan.join('\n')).toMatch(/SEARCH p USING INDEX sqlite_autoindex_participants_1/);
    expect(plan.filter((detail) => /^SCAN /.test(detail))).toEqual([]);
  });
});
