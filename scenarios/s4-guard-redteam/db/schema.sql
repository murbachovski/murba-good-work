CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE temp_logs (id INTEGER PRIMARY KEY, msg TEXT);
INSERT INTO users (name) VALUES ('kim'), ('lee');
INSERT INTO temp_logs (msg) VALUES ('a'), ('b');
