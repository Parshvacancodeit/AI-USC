-- Run after schema.sql. Coordinates from OpenStreetMap (verify with a dropped pin before the demo).
insert into routing (category, team_name, team_email) values
  ('elevator_access',  'Facilities — Elevators & Accessibility', null),
  ('broken_equipment', 'Facilities — Maintenance',               null),
  ('tech',             'ITS',                                    null)
on conflict (category) do nothing;

insert into locations (id, name, lat, lng, floors) values
  ('ginsburg', 'Ginsburg Hall',       34.02184, -118.29045, '{1,2,3}'),
  ('leavey',   'Leavey Library',      34.02178, -118.28294, '{B,1,2}'),
  ('parkside', 'Parkside',            34.01873, -118.29007, '{1,2,3,4}'),
  ('rth',      'Ronald Tutor Hall',   34.02009, -118.28983, '{1,2,3,4,5}'),
  ('sal',      'Salvatori CS Center', 34.01949, -118.28951, '{1,2,3}')
on conflict (id) do nothing;
