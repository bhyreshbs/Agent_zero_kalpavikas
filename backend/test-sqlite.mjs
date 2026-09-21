import sqlite3 from 'node-sqlite3-wasm';
const db = new sqlite3.Database(':memory:');
db.exec('CREATE TABLE t(key TEXT PRIMARY KEY, value TEXT NOT NULL)');

const s1 = db.prepare('INSERT INTO t(key,value) VALUES(@key,@value)');
try {
  s1.run({'@key':'a', '@value':'b'});
  console.log('Passed @obj');
} catch (e) {
  console.error('Failed @obj:', e.message);
}

try {
  s1.run({key:'a', value:'b'});
  console.log('Passed obj without @');
} catch (e) {
  console.error('Failed obj without @:', e.message);
}

const s2 = db.prepare('INSERT INTO t(key,value) VALUES($key,$value)');
try {
  s2.run({$key:'c', $value:'d'});
  console.log('Passed $obj');
} catch (e) {
  console.error('Failed $obj:', e.message);
}

try {
  s2.run({key:'c', value:'d'});
  console.log('Passed $obj without $');
} catch (e) {
  console.error('Failed $obj without $:', e.message);
}

const s3 = db.prepare('INSERT INTO t(key,value) VALUES(:key,:value)');
try {
  s3.run({':key':'e', ':value':'f'});
  console.log('Passed :obj');
} catch (e) {
  console.error('Failed :obj:', e.message);
}

db.close();
