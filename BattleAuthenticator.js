const crypto = require('crypto')
const bignum = require('bignum')
const request = require('sync-request')
const base32 = require('hi-base32')
const totp = require('totp-generator')

const server = {
    'CN': 'http://mobile-service.battlenet.com.cn',
    'KR': 'http://mobile-service.blizzard.com',
    'US': 'http://mobile-service.blizzard.com',
    'EU': 'http://mobile-service.blizzard.com'
};

const initialize_uri = "/enrollment/enroll.htm";

const synchronize_uri = "/enrollment/time.htm";

const restore_uri = "/enrollment/initiatePaperRestore.htm";

const restore_validate_uri = "/enrollment/validatePaperRestore.htm";

const RSA_MOD = bignum("104890018807986556874007710914205443157030159668034197186125678960287470894290830530618284943118405110896322835449099433232093151168250152146023319326491587651685252774820340995950744075665455681760652136576493028733914892166700899109836291180881063097461175643998356321993663868233366705340758102567742483097");
const RSA_KEY = bignum(257);


class BattleAuthenticator {
    constructor(serial, secret) {
        if (!secret) {
            this.region = serial;
        } else {
            this.serial = serial;
            this.secret = secret;
        }
    }

    static generate(region) {
        let authenticator = new BattleAuthenticator(region);
        authenticator.initialize();
        return authenticator;
    }

    static restore(serial, restore_code) {
        let authenticator = new BattleAuthenticator(serial, 'tempsecret');
        authenticator.restore(restore_code);
        return authenticator;
    }

    static factory(serial, secret, sync) {
        let authenticator = new BattleAuthenticator(serial, secret);
        if (sync) {
            authenticator._sync = sync;
        }
        return authenticator;
    }

    initialize() {
        let enc_key = this.createKey(37);
        let data = Buffer.concat([Buffer.from([1]), enc_key, Buffer.from(this.region), Buffer.from('Motorola RAZR v3')]);
        let buffer = this.send(initialize_uri, this.encrypt(data));
        let result = this.decrypt(buffer.slice(8), enc_key);
        this.sync = bignum.fromBuffer(buffer.slice(0, 8)).toNumber();
        this.serial = result.slice(20);
        this.secret = result.slice(0, 20);
    }

    restore(restore_code) {
        try {
            restore_code = this.restore_code_from_char(restore_code);
            let serial = this.plain_serial;
            let enc_key = this.createKey(20);
            let challenge = this.send(restore_uri, serial);
            let mac = crypto.createHmac('sha1', restore_code).update(Buffer.concat([serial, challenge])).digest();
            let data = Buffer.concat([serial, this.encrypt(Buffer.concat([mac, enc_key]))]);
            let respones = this.send(restore_validate_uri, data);
            this.secret = this.decrypt(respones, enc_key);
        } catch (error) {
            throw Error(error)
        }
    }

    synchronize() {
        let response = this.send(synchronize_uri);
        this.sync = bignum.fromBuffer(response).toNumber();
    }

    send(uri, data = '') {
        let method = !data ? 'GET' : 'POST';
        let response = request(method, `${server[this.region]}${uri}`, {
            headers: {
                'Content-Type': 'application/octet-stream'
            },
            encoding: null,
            body: data
        });
        return response.getBody();
    }

    createKey(size) {
        return crypto.randomBytes(size);
    }

    encrypt(buffer) {
        let data = bignum(buffer.toString('hex'), 16);
        let n = data.pow(RSA_KEY).mod(RSA_MOD);
        let ret = [];
        while (n > 0) {
            let m = n.mod(256);
            ret.unshift(m.toNumber());
            n = n.div(256);
        }
        return Buffer.from(ret);
    }

    decrypt(buffer, key) {
        return Buffer.from(buffer.map((item, index) => item ^ key[index]));
    }

    restore_code_from_char(restore) {
        return Buffer.from(restore.split('').map(item => {
            let temp = item.charCodeAt(0);
            if (temp > 47 && temp < 58)
                temp -= 48;
            else {
                if (temp > 82) temp--; // S
                if (temp > 78) temp--; // O
                if (temp > 75) temp--; // L
                if (temp > 72) temp--; // I
                temp -= 55;
            }
            return temp;
        }));
    }

    restore_code_to_char(data) {
        return Array.from(data).map(item => {
            let temp = item & 0x1f;
            if (temp < 10)
                temp += 48;
            else {
                temp += 55;
                if (temp > 72) temp++; // I
                if (temp > 75) temp++; // L
                if (temp > 78) temp++; // O
                if (temp > 82) temp++; // S
            }
            return String.fromCharCode(temp);
        }).join('');
    }

    get remaining() {
        return this.waiting_time - this.server_time % this.waiting_time;
    }

    get region() {
        return this._region.toString();
    }

    set region(region) {
        if (typeof region === 'string') region = region.toUpperCase();
        this._region = Buffer.from(region);
    }

    get serial() {
        return this._serial.toString();
    }

    set serial(serial) {
        this._serial = Buffer.from(serial);
        this._region = serial.slice(0, 2);
    }

    get secret() {
        return this._secret.toString('hex');
    }

    set secret(secret) {
        this._secret = Buffer.from(secret);
    }

    get secretBuffer(){
        return this._secret
    }

    get sync() {
        return this._sync || 0;
    }

    set sync(sync) {
        this._sync = sync - Date.now();
    }

    get restore_code() {
        if (this._restore_code) {
            return this._restore_code;
        } else {
            let data = crypto.createHash('sha1').update(Buffer.concat([this.plain_serial, this._secret])).digest().slice(-10);
            return this.restore_code_to_char(data);
        }
    }

    set restore_code(restore_code) {
        this._restore_code = restore_code;
    }

    get plain_serial() {
        return Buffer.from(this._serial.toString().replace(/-/g, '').toUpperCase());
    }

    get waiting_time() {
        return 30000;
    }

    get server_time() {
        if (!this.sync) this.synchronize();
        return Date.now() + this.sync;
    }

    get code() {
        return totp(base32.encode(Buffer.from(this.secret, 'hex')), { digits: 8 })
        // let cycle =  Buffer.from( new Int32Array(8) );
        // cycle.writeUInt32BE(Math.floor(this.server_time / this.waiting_time), 0, 8,true);
        // let mac = crypto.createHmac('sha256', this._secret).update(cycle).digest('hex');
        // let mac_part = mac.substr(parseInt(mac[39], 16) * 2, 8);
        // let code = String((parseInt(mac_part, 16) & 0x7fffffff) % 100000000);
        // return Array(8 - code.length + 1).join('0') + code;
    }
}

module.exports  = BattleAuthenticator;