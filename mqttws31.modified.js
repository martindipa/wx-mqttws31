if (typeof Paho === "undefined") {
    var Paho = {}
}
Paho.MQTT = (function(wx) {
    var version = "@VERSION@";
    var buildLevel = "@BUILDLEVEL@";
    var MESSAGE_TYPE = {
        CONNECT: 1,
        CONNACK: 2,
        PUBLISH: 3,
        PUBACK: 4,
        PUBREC: 5,
        PUBREL: 6,
        PUBCOMP: 7,
        SUBSCRIBE: 8,
        SUBACK: 9,
        UNSUBSCRIBE: 10,
        UNSUBACK: 11,
        PINGREQ: 12,
        PINGRESP: 13,
        DISCONNECT: 14
    };
    var validate = function(obj, keys) {
            for (var key in obj) {
                if (obj.hasOwnProperty(key)) {
                    if (keys.hasOwnProperty(key)) {
                        if (typeof obj[key] !== keys[key]) throw new Error(format(ERROR.INVALID_TYPE, [typeof obj[key], key]));
                    } else {
                        var errorStr = "Unknown property, " + key + ". Valid properties are:";
                        for (var key in keys) if (keys.hasOwnProperty(key)) errorStr = errorStr + " " + key;
                        throw new Error(errorStr);
                    }
                }
            }
        };
    var scope = function(f, scope) {
            return function() {
                return f.apply(scope, arguments)
            }
        };
    var ERROR = {
        OK: {
            code: 0,
            text: "AMQJSC0000I OK."
        },
        CONNECT_TIMEOUT: {
            code: 1,
            text: "AMQJSC0001E Connect timed out."
        },
        SUBSCRIBE_TIMEOUT: {
            code: 2,
            text: "AMQJS0002E Subscribe timed out."
        },
        UNSUBSCRIBE_TIMEOUT: {
            code: 3,
            text: "AMQJS0003E Unsubscribe timed out."
        },
        PING_TIMEOUT: {
            code: 4,
            text: "AMQJS0004E Ping timed out."
        },
        INTERNAL_ERROR: {
            code: 5,
            text: "AMQJS0005E Internal error. Error Message: {0}, Stack trace: {1}"
        },
        CONNACK_RETURNCODE: {
            code: 6,
            text: "AMQJS0006E Bad Connack return code:{0} {1}."
        },
        SOCKET_ERROR: {
            code: 7,
            text: "AMQJS0007E Socket error:{0}."
        },
        SOCKET_CLOSE: {
            code: 8,
            text: "AMQJS0008I Socket closed."
        },
        MALFORMED_UTF: {
            code: 9,
            text: "AMQJS0009E Malformed UTF data:{0} {1} {2}."
        },
        UNSUPPORTED: {
            code: 10,
            text: "AMQJS0010E {0} is not supported by this browser."
        },
        INVALID_STATE: {
            code: 11,
            text: "AMQJS0011E Invalid state {0}."
        },
        INVALID_TYPE: {
            code: 12,
            text: "AMQJS0012E Invalid type {0} for {1}."
        },
        INVALID_ARGUMENT: {
            code: 13,
            text: "AMQJS0013E Invalid argument {0} for {1}."
        },
        UNSUPPORTED_OPERATION: {
            code: 14,
            text: "AMQJS0014E Unsupported operation."
        },
        INVALID_STORED_DATA: {
            code: 15,
            text: "AMQJS0015E Invalid data in local storage key={0} value={1}."
        },
        INVALID_MQTT_MESSAGE_TYPE: {
            code: 16,
            text: "AMQJS0016E Invalid MQTT message type {0}."
        },
        MALFORMED_UNICODE: {
            code: 17,
            text: "AMQJS0017E Malformed Unicode string:{0} {1}."
        },
    };
    var CONNACK_RC = {
        0: "Connection Accepted",
        1: "Connection Refused: unacceptable protocol version",
        2: "Connection Refused: identifier rejected",
        3: "Connection Refused: server unavailable",
        4: "Connection Refused: bad user name or password",
        5: "Connection Refused: not authorized"
    };
    var format = function(error, substitutions) {
            var text = error.text;
            if (substitutions) {
                var field, start;
                for (var i = 0; i < substitutions.length; i++) {
                    field = "{" + i + "}";
                    start = text.indexOf(field);
                    if (start > 0) {
                        var part1 = text.substring(0, start);
                        var part2 = text.substring(start + field.length);
                        text = part1 + substitutions[i] + part2
                    }
                }
            }
            return text
        };
    var MqttProtoIdentifierv3 = [0x00, 0x06, 0x4d, 0x51, 0x49, 0x73, 0x64, 0x70, 0x03];
    var MqttProtoIdentifierv4 = [0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04];
    var WireMessage = function(type, options) {
            this.type = type;
            for (var name in options) {
                if (options.hasOwnProperty(name)) {
                    this[name] = options[name]
                }
            }
        };
    WireMessage.prototype.encode = function() {
        var first = ((this.type & 0x0f) << 4);
        var remLength = 0;
        var topicStrLength = new Array();
        var destinationNameLength = 0;
        if (this.messageIdentifier != undefined) remLength += 2;
        switch (this.type) {
        case MESSAGE_TYPE.CONNECT:
            switch (this.mqttVersion) {
            case 3:
                remLength += MqttProtoIdentifierv3.length + 3;
                break;
            case 4:
                remLength += MqttProtoIdentifierv4.length + 3;
                break
            }
            remLength += UTF8Length(this.clientId) + 2;
            if (this.willMessage != undefined) {
                remLength += UTF8Length(this.willMessage.destinationName) + 2;
                var willMessagePayloadBytes = this.willMessage.payloadBytes;
                if (!(willMessagePayloadBytes instanceof Uint8Array)) willMessagePayloadBytes = new Uint8Array(payloadBytes);
                remLength += willMessagePayloadBytes.byteLength + 2
            }
            if (this.userName != undefined) remLength += UTF8Length(this.userName) + 2;
            if (this.password != undefined) remLength += UTF8Length(this.password) + 2;
            break;
        case MESSAGE_TYPE.SUBSCRIBE:
            first |= 0x02;
            for (var i = 0; i < this.topics.length; i++) {
                topicStrLength[i] = UTF8Length(this.topics[i]);
                remLength += topicStrLength[i] + 2
            }
            remLength += this.requestedQos.length;
            break;
        case MESSAGE_TYPE.UNSUBSCRIBE:
            first |= 0x02;
            for (var i = 0; i < this.topics.length; i++) {
                topicStrLength[i] = UTF8Length(this.topics[i]);
                remLength += topicStrLength[i] + 2
            }
            break;
        case MESSAGE_TYPE.PUBREL:
            first |= 0x02;
            break;
        case MESSAGE_TYPE.PUBLISH:
            if (this.payloadMessage.duplicate) first |= 0x08;
            first = first |= (this.payloadMessage.qos << 1);
            if (this.payloadMessage.retained) first |= 0x01;
            destinationNameLength = UTF8Length(this.payloadMessage.destinationName);
            remLength += destinationNameLength + 2;
            var payloadBytes = this.payloadMessage.payloadBytes;
            remLength += payloadBytes.byteLength;
            if (payloadBytes instanceof ArrayBuffer) payloadBytes = new Uint8Array(payloadBytes);
            else if (!(payloadBytes instanceof Uint8Array)) payloadBytes = new Uint8Array(payloadBytes.buffer);
            break;
        case MESSAGE_TYPE.DISCONNECT:
            break;
        default:
        }
        var mbi = encodeMBI(remLength);
        var pos = mbi.length + 1;
        var buffer = new ArrayBuffer(remLength + pos);
        var byteStream = new Uint8Array(buffer);
        byteStream[0] = first;
        byteStream.set(mbi, 1);
        if (this.type == MESSAGE_TYPE.PUBLISH) pos = writeString(this.payloadMessage.destinationName, destinationNameLength, byteStream, pos);
        else if (this.type == MESSAGE_TYPE.CONNECT) {
            switch (this.mqttVersion) {
            case 3:
                byteStream.set(MqttProtoIdentifierv3, pos);
                pos += MqttProtoIdentifierv3.length;
                break;
            case 4:
                byteStream.set(MqttProtoIdentifierv4, pos);
                pos += MqttProtoIdentifierv4.length;
                break
            }
            var connectFlags = 0;
            if (this.cleanSession) connectFlags = 0x02;
            if (this.willMessage != undefined) {
                connectFlags |= 0x04;
                connectFlags |= (this.willMessage.qos << 3);
                if (this.willMessage.retained) {
                    connectFlags |= 0x20
                }
            }
            if (this.userName != undefined) connectFlags |= 0x80;
            if (this.password != undefined) connectFlags |= 0x40;
            byteStream[pos++] = connectFlags;
            pos = writeUint16(this.keepAliveInterval, byteStream, pos)
        }
        if (this.messageIdentifier != undefined) pos = writeUint16(this.messageIdentifier, byteStream, pos);
        switch (this.type) {
        case MESSAGE_TYPE.CONNECT:
            pos = writeString(this.clientId, UTF8Length(this.clientId), byteStream, pos);
            if (this.willMessage != undefined) {
                pos = writeString(this.willMessage.destinationName, UTF8Length(this.willMessage.destinationName), byteStream, pos);
                pos = writeUint16(willMessagePayloadBytes.byteLength, byteStream, pos);
                byteStream.set(willMessagePayloadBytes, pos);
                pos += willMessagePayloadBytes.byteLength
            }
            if (this.userName != undefined) pos = writeString(this.userName, UTF8Length(this.userName), byteStream, pos);
            if (this.password != undefined) pos = writeString(this.password, UTF8Length(this.password), byteStream, pos);
            break;
        case MESSAGE_TYPE.PUBLISH:
            byteStream.set(payloadBytes, pos);
            break;
        case MESSAGE_TYPE.SUBSCRIBE:
            for (var i = 0; i < this.topics.length; i++) {
                pos = writeString(this.topics[i], topicStrLength[i], byteStream, pos);
                byteStream[pos++] = this.requestedQos[i]
            }
            break;
        case MESSAGE_TYPE.UNSUBSCRIBE:
            for (var i = 0; i < this.topics.length; i++) pos = writeString(this.topics[i], topicStrLength[i], byteStream, pos);
            break;
        default:
        }
        return buffer
    }
    function decodeMessage(input, pos) {
        var startingPos = pos;
        var first = input[pos];
        var type = first >> 4;
        var messageInfo = first &= 0x0f;
        pos += 1;
        var digit;
        var remLength = 0;
        var multiplier = 1;
        do {
            if (pos == input.length) {
                return [null, startingPos]
            }
            digit = input[pos++];
            remLength += ((digit & 0x7F) * multiplier);
            multiplier *= 128
        } while ((digit & 0x80) != 0);
        var endPos = pos + remLength;
        if (endPos > input.length) {
            return [null, startingPos]
        }
        var wireMessage = new WireMessage(type);
        switch (type) {
        case MESSAGE_TYPE.CONNACK:
            var connectAcknowledgeFlags = input[pos++];
            if (connectAcknowledgeFlags & 0x01) wireMessage.sessionPresent = true;
            wireMessage.returnCode = input[pos++];
            break;
        case MESSAGE_TYPE.PUBLISH:
            var qos = (messageInfo >> 1) & 0x03;
            var len = readUint16(input, pos);
            pos += 2;
            var topicName = parseUTF8(input, pos, len);
            pos += len;
            if (qos > 0) {
                wireMessage.messageIdentifier = readUint16(input, pos);
                pos += 2
            }
            var message = new Paho.MQTT.Message(input.subarray(pos, endPos));
            if ((messageInfo & 0x01) == 0x01) message.retained = true;
            if ((messageInfo & 0x08) == 0x08) message.duplicate = true;
            message.qos = qos;
            message.destinationName = topicName;
            wireMessage.payloadMessage = message;
            break;
        case MESSAGE_TYPE.PUBACK:
        case MESSAGE_TYPE.PUBREC:
        case MESSAGE_TYPE.PUBREL:
        case MESSAGE_TYPE.PUBCOMP:
        case MESSAGE_TYPE.UNSUBACK:
            wireMessage.messageIdentifier = readUint16(input, pos);
            break;
        case MESSAGE_TYPE.SUBACK:
            wireMessage.messageIdentifier = readUint16(input, pos);
            pos += 2;
            wireMessage.returnCode = input.subarray(pos, endPos);
            break;
        default:
        }
        return [wireMessage, endPos]
    }
    function writeUint16(input, buffer, offset) {
        buffer[offset++] = input >> 8;
        buffer[offset++] = input % 256;
        return offset
    }
    function writeString(input, utf8Length, buffer, offset) {
        offset = writeUint16(utf8Length, buffer, offset);
        stringToUTF8(input, buffer, offset);
        return offset + utf8Length
    }
    function readUint16(buffer, offset) {
        return 256 * buffer[offset] + buffer[offset + 1]
    }
    function encodeMBI(number) {
        var output = new Array(1);
        var numBytes = 0;
        do {
            var digit = number % 128;
            number = number >> 7;
            if (number > 0) {
                digit |= 0x80
            }
            output[numBytes++] = digit
        } while ((number > 0) && (numBytes < 4));
        return output
    }
    function UTF8Length(input) {
        var output = 0;
        for (var i = 0; i < input.length; i++) {
            var charCode = input.charCodeAt(i);
            if (charCode > 0x7FF) {
                if (0xD800 <= charCode && charCode <= 0xDBFF) {
                    i++;
                    output++
                }
                output += 3
            } else if (charCode > 0x7F) output += 2;
            else output++
        }
        return output
    }
    function stringToUTF8(input, output, start) {
        var pos = start;
        for (var i = 0; i < input.length; i++) {
            var charCode = input.charCodeAt(i);
            if (0xD800 <= charCode && charCode <= 0xDBFF) {
                var lowCharCode = input.charCodeAt(++i);
                if (isNaN(lowCharCode)) {
                    throw new Error(format(ERROR.MALFORMED_UNICODE, [charCode, lowCharCode]));
                }
                charCode = ((charCode - 0xD800) << 10) + (lowCharCode - 0xDC00) + 0x10000
            }
            if (charCode <= 0x7F) {
                output[pos++] = charCode
            } else if (charCode <= 0x7FF) {
                output[pos++] = charCode >> 6 & 0x1F | 0xC0;
                output[pos++] = charCode & 0x3F | 0x80
            } else if (charCode <= 0xFFFF) {
                output[pos++] = charCode >> 12 & 0x0F | 0xE0;
                output[pos++] = charCode >> 6 & 0x3F | 0x80;
                output[pos++] = charCode & 0x3F | 0x80
            } else {
                output[pos++] = charCode >> 18 & 0x07 | 0xF0;
                output[pos++] = charCode >> 12 & 0x3F | 0x80;
                output[pos++] = charCode >> 6 & 0x3F | 0x80;
                output[pos++] = charCode & 0x3F | 0x80
            }
        }
        return output
    }
    function parseUTF8(input, offset, length) {
        var output = "";
        var utf16;
        var pos = offset;
        while (pos < offset + length) {
            var byte1 = input[pos++];
            if (byte1 < 128) utf16 = byte1;
            else {
                var byte2 = input[pos++] - 128;
                if (byte2 < 0) throw new Error(format(ERROR.MALFORMED_UTF, [byte1.toString(16), byte2.toString(16), ""]));
                if (byte1 < 0xE0) utf16 = 64 * (byte1 - 0xC0) + byte2;
                else {
                    var byte3 = input[pos++] - 128;
                    if (byte3 < 0) throw new Error(format(ERROR.MALFORMED_UTF, [byte1.toString(16), byte2.toString(16), byte3.toString(16)]));
                    if (byte1 < 0xF0) utf16 = 4096 * (byte1 - 0xE0) + 64 * byte2 + byte3;
                    else {
                        var byte4 = input[pos++] - 128;
                        if (byte4 < 0) throw new Error(format(ERROR.MALFORMED_UTF, [byte1.toString(16), byte2.toString(16), byte3.toString(16), byte4.toString(16)]));
                        if (byte1 < 0xF8) utf16 = 262144 * (byte1 - 0xF0) + 4096 * byte2 + 64 * byte3 + byte4;
                        else throw new Error(format(ERROR.MALFORMED_UTF, [byte1.toString(16), byte2.toString(16), byte3.toString(16), byte4.toString(16)]));
                    }
                }
            }
            if (utf16 > 0xFFFF) {
                utf16 -= 0x10000;
                output += String.fromCharCode(0xD800 + (utf16 >> 10));
                utf16 = 0xDC00 + (utf16 & 0x3FF)
            }
            output += String.fromCharCode(utf16)
        }
        return output
    }
    var Pinger = function(client, keepAliveInterval) {
            this._client = client;
            this._keepAliveInterval = keepAliveInterval * 1000;
            this.isReset = false;
            var pingReq = new WireMessage(MESSAGE_TYPE.PINGREQ).encode();
            var doTimeout = function(pinger) {
                    return function() {
                        return doPing.apply(pinger)
                    }
                };
            var doPing = function() {
                    if (!this.isReset) {
                        this._client._trace("Pinger.doPing", "Timed out");
                        this._client._disconnected(ERROR.PING_TIMEOUT.code, format(ERROR.PING_TIMEOUT))
                    } else {
                        this.isReset = false;
                        this._client._trace("Pinger.doPing", "send PINGREQ");
                        wx.sendSocketMessage({
                            data: pingReq,
                            success: function() {
                                console.log("Success send PINGREQ")
                            }
                        });
                        this.timeout = setTimeout(doTimeout(this), this._keepAliveInterval)
                    }
                }
            this.reset = function() {
                this.isReset = true;
                clearTimeout(this.timeout);
                if (this._keepAliveInterval > 0) this.timeout = setTimeout(doTimeout(this), this._keepAliveInterval)
            }
            this.cancel = function() {
                clearTimeout(this.timeout)
            }
        };
    var Timeout = function(client, timeoutSeconds, action, args) {
            if (!timeoutSeconds) timeoutSeconds = 30;
            var doTimeout = function(action, client, args) {
                    return function() {
                        return action.apply(client, args)
                    }
                };
            this.timeout = setTimeout(doTimeout(action, client, args), timeoutSeconds * 1000);
            this.cancel = function() {
                clearTimeout(this.timeout)
            }
        };
    var ClientImpl = function(uri, host, port, path, clientId) {
            this._trace("Paho.MQTT.Client", uri, host, port, path, clientId);
            this.host = host;
            this.port = port;
            this.path = path;
            this.uri = uri;
            this.clientId = clientId;
            this._localKey = host + ":" + port + (path != "/mqtt" ? ":" + path : "") + ":" + clientId + ":";
            this._msg_queue = [];
            this._sentMessages = {};
            this._receivedMessages = {};
            this._notify_msg_sent = {};
            this._message_identifier = 1;
            this._sequence = 0;
            for (var key in wx.getStorageInfoSync().keys) if (key.indexOf("Sent:" + this._localKey) == 0 || key.indexOf("Received:" + this._localKey) == 0) this.restore(key)
        };
    ClientImpl.prototype.host;
    ClientImpl.prototype.port;
    ClientImpl.prototype.path;
    ClientImpl.prototype.uri;
    ClientImpl.prototype.clientId;
    ClientImpl.prototype.socket;
    ClientImpl.prototype.connected = false;
    ClientImpl.prototype.maxMessageIdentifier = 65536;
    ClientImpl.prototype.connectOptions;
    ClientImpl.prototype.hostIndex;
    ClientImpl.prototype.onConnectionLost;
    ClientImpl.prototype.onMessageDelivered;
    ClientImpl.prototype.onMessageArrived;
    ClientImpl.prototype.traceFunction;
    ClientImpl.prototype._msg_queue = null;
    ClientImpl.prototype._connectTimeout;
    ClientImpl.prototype.sendPinger = null;
    ClientImpl.prototype.receivePinger = null;
    ClientImpl.prototype.receiveBuffer = null;
    ClientImpl.prototype._traceBuffer = null;
    ClientImpl.prototype._MAX_TRACE_ENTRIES = 100;
    ClientImpl.prototype.connect = function(connectOptions) {
        var connectOptionsMasked = this._traceMask(connectOptions, "password");
        this._trace("Client.connect", connectOptionsMasked, this.socket, this.connected);
        if (this.connected) throw new Error(format(ERROR.INVALID_STATE, ["already connected"]));
        if (this.socket) throw new Error(format(ERROR.INVALID_STATE, ["already connected"]));
        this.connectOptions = connectOptions;
        if (connectOptions.uris) {
            this.hostIndex = 0;
            this._doConnect(connectOptions.uris[0])
        } else {
            this._doConnect(this.uri)
        }
    };
    ClientImpl.prototype.subscribe = function(filter, subscribeOptions) {
        this._trace("Client.subscribe", filter, subscribeOptions);
        if (!this.connected) throw new Error(format(ERROR.INVALID_STATE, ["not connected"]));
        var wireMessage = new WireMessage(MESSAGE_TYPE.SUBSCRIBE);
        wireMessage.topics = [filter];
        if (subscribeOptions.qos != undefined) wireMessage.requestedQos = [subscribeOptions.qos];
        else wireMessage.requestedQos = [0];
        if (subscribeOptions.onSuccess) {
            wireMessage.onSuccess = function(grantedQos) {
                subscribeOptions.onSuccess({
                    invocationContext: subscribeOptions.invocationContext,
                    grantedQos: grantedQos
                })
            }
        }
        if (subscribeOptions.onFailure) {
            wireMessage.onFailure = function(errorCode) {
                subscribeOptions.onFailure({
                    invocationContext: subscribeOptions.invocationContext,
                    errorCode: errorCode
                })
            }
        }
        if (subscribeOptions.timeout) {
            wireMessage.timeOut = new Timeout(this, subscribeOptions.timeout, subscribeOptions.onFailure, [{
                invocationContext: subscribeOptions.invocationContext,
                errorCode: ERROR.SUBSCRIBE_TIMEOUT.code,
                errorMessage: format(ERROR.SUBSCRIBE_TIMEOUT)
            }])
        }
        this._requires_ack(wireMessage);
        this._schedule_message(wireMessage)
    };
    ClientImpl.prototype.unsubscribe = function(filter, unsubscribeOptions) {
        this._trace("Client.unsubscribe", filter, unsubscribeOptions);
        if (!this.connected) throw new Error(format(ERROR.INVALID_STATE, ["not connected"]));
        var wireMessage = new WireMessage(MESSAGE_TYPE.UNSUBSCRIBE);
        wireMessage.topics = [filter];
        if (unsubscribeOptions.onSuccess) {
            wireMessage.callback = function() {
                unsubscribeOptions.onSuccess({
                    invocationContext: unsubscribeOptions.invocationContext
                })
            }
        }
        if (unsubscribeOptions.timeout) {
            wireMessage.timeOut = new Timeout(this, unsubscribeOptions.timeout, unsubscribeOptions.onFailure, [{
                invocationContext: unsubscribeOptions.invocationContext,
                errorCode: ERROR.UNSUBSCRIBE_TIMEOUT.code,
                errorMessage: format(ERROR.UNSUBSCRIBE_TIMEOUT)
            }])
        }
        this._requires_ack(wireMessage);
        this._schedule_message(wireMessage)
    };
    ClientImpl.prototype.send = function(message) {
        this._trace("Client.send", message);
        if (!this.connected) throw new Error(format(ERROR.INVALID_STATE, ["not connected"]));
        var wireMessage = new WireMessage(MESSAGE_TYPE.PUBLISH);
        wireMessage.payloadMessage = message;
        if (message.qos > 0) {
            this._requires_ack(wireMessage);
        } else if (this.onMessageDelivered) {
            this._notify_msg_sent[wireMessage] = this.onMessageDelivered(wireMessage.payloadMessage);
        }
        this._schedule_message(wireMessage);
    };
    ClientImpl.prototype.disconnect = function() {
        this._trace("Client.disconnect");
        if (!this.socket) throw new Error(format(ERROR.INVALID_STATE, ["not connecting or connected"]));
        wireMessage = new WireMessage(MESSAGE_TYPE.DISCONNECT);
        this._notify_msg_sent[wireMessage] = scope(this._disconnected, this);
        this._schedule_message(wireMessage)
    };
    ClientImpl.prototype.getTraceLog = function() {
        if (this._traceBuffer !== null) {
            this._trace("Client.getTraceLog", new Date());
            this._trace("Client.getTraceLog in flight messages", this._sentMessages.length);
            for (var key in this._sentMessages) this._trace("_sentMessages ", key, this._sentMessages[key]);
            for (var key in this._receivedMessages) this._trace("_receivedMessages ", key, this._receivedMessages[key]);
            return this._traceBuffer
        }
    };
    ClientImpl.prototype.startTrace = function() {
        if (this._traceBuffer === null) {
            this._traceBuffer = []
        }
        this._trace("Client.startTrace", new Date(), version)
    };
    ClientImpl.prototype.stopTrace = function() {
        delete this._traceBuffer
    };
    ClientImpl.prototype._doConnect = function(wsurl) {
        if (this.connectOptions.useSSL) {
            var uriParts = wsurl.split(":");
            uriParts[0] = "wss";
            wsurl = uriParts.join(":")
        }
        this.connected = false;
        if (this.connectOptions.mqttVersion < 4) {
            // this.socket = new WebSocket(wsurl, ["mqttv3.1"])
        } else {
            // this.socket = new WebSocket(wsurl, ["mqtt"])
        }
        wx.connectSocket({
            url: wsurl
        });
        // this.socket.binaryType = 'arraybuffer';
        wx.onSocketOpen(scope(this._on_socket_open, this));
        wx.onSocketMessage(scope(this._on_socket_message, this));
        wx.onSocketError(scope(this._on_socket_error, this));
        wx.onSocketClose(scope(this._on_socket_close, this));
        this.sendPinger = new Pinger(this, this.connectOptions.keepAliveInterval);
        this.receivePinger = new Pinger(this, this.connectOptions.keepAliveInterval);
        this._connectTimeout = new Timeout(this, this.connectOptions.timeout, this._disconnected, [ERROR.CONNECT_TIMEOUT.code, format(ERROR.CONNECT_TIMEOUT)])
    };
    ClientImpl.prototype._schedule_message = function(message) {
        this._msg_queue.push(message);
        if (this.connected) {
            this._process_queue()
        }
    };
    ClientImpl.prototype.store = function(prefix, wireMessage) {
        var storedMessage = {
            type: wireMessage.type,
            messageIdentifier: wireMessage.messageIdentifier,
            version: 1
        };
        switch (wireMessage.type) {
        case MESSAGE_TYPE.PUBLISH:
            if (wireMessage.pubRecReceived) storedMessage.pubRecReceived = true;
            storedMessage.payloadMessage = {};
            var hex = "";
            var messageBytes = wireMessage.payloadMessage.payloadBytes;
            for (var i = 0; i < messageBytes.length; i++) {
                if (messageBytes[i] <= 0xF) hex = hex + "0" + messageBytes[i].toString(16);
                else hex = hex + messageBytes[i].toString(16)
            }
            storedMessage.payloadMessage.payloadHex = hex;
            storedMessage.payloadMessage.qos = wireMessage.payloadMessage.qos;
            storedMessage.payloadMessage.destinationName = wireMessage.payloadMessage.destinationName;
            if (wireMessage.payloadMessage.duplicate) storedMessage.payloadMessage.duplicate = true;
            if (wireMessage.payloadMessage.retained) storedMessage.payloadMessage.retained = true;
            if (prefix.indexOf("Sent:") == 0) {
                if (wireMessage.sequence === undefined) wireMessage.sequence = ++this._sequence;
                storedMessage.sequence = wireMessage.sequence
            }
            break;
        default:
            throw Error(format(ERROR.INVALID_STORED_DATA, [key, storedMessage]));
        }
        wx.setStorageSync(prefix + this._localKey + wireMessage.messageIdentifier, JSON.stringify(storedMessage))
    };
    ClientImpl.prototype.restore = function(key) {
        var value = wx.getStorageSync(key);
        var storedMessage = JSON.parse(value);
        var wireMessage = new WireMessage(storedMessage.type, storedMessage);
        switch (storedMessage.type) {
        case MESSAGE_TYPE.PUBLISH:
            var hex = storedMessage.payloadMessage.payloadHex;
            var buffer = new ArrayBuffer((hex.length) / 2);
            var byteStream = new Uint8Array(buffer);
            var i = 0;
            while (hex.length >= 2) {
                var x = parseInt(hex.substring(0, 2), 16);
                hex = hex.substring(2, hex.length);
                byteStream[i++] = x
            }
            var payloadMessage = new Paho.MQTT.Message(byteStream);
            payloadMessage.qos = storedMessage.payloadMessage.qos;
            payloadMessage.destinationName = storedMessage.payloadMessage.destinationName;
            if (storedMessage.payloadMessage.duplicate) payloadMessage.duplicate = true;
            if (storedMessage.payloadMessage.retained) payloadMessage.retained = true;
            wireMessage.payloadMessage = payloadMessage;
            break;
        default:
            throw Error(format(ERROR.INVALID_STORED_DATA, [key, value]));
        }
        if (key.indexOf("Sent:" + this._localKey) == 0) {
            wireMessage.payloadMessage.duplicate = true;
            this._sentMessages[wireMessage.messageIdentifier] = wireMessage
        } else if (key.indexOf("Received:" + this._localKey) == 0) {
            this._receivedMessages[wireMessage.messageIdentifier] = wireMessage
        }
    };
    ClientImpl.prototype._process_queue = function() {
        var message = null;
        var fifo = this._msg_queue.reverse();
        while ((message = fifo.pop())) {
            this._socket_send(message);
            if (this._notify_msg_sent[message]) {
                this._notify_msg_sent[message]();
                delete this._notify_msg_sent[message]
            }
        }
    };
    ClientImpl.prototype._requires_ack = function(wireMessage) {
        var messageCount = Object.keys(this._sentMessages).length;
        if (messageCount > this.maxMessageIdentifier) throw Error("Too many messages:" + messageCount);
        while (this._sentMessages[this._message_identifier] !== undefined) {
            this._message_identifier++
        }
        wireMessage.messageIdentifier = this._message_identifier;
        this._sentMessages[wireMessage.messageIdentifier] = wireMessage;
        if (wireMessage.type === MESSAGE_TYPE.PUBLISH) {
            this.store("Sent:", wireMessage)
        }
        if (this._message_identifier === this.maxMessageIdentifier) {
            this._message_identifier = 1
        }
    };
    ClientImpl.prototype._on_socket_open = function() {
        var wireMessage = new WireMessage(MESSAGE_TYPE.CONNECT, this.connectOptions);
        wireMessage.clientId = this.clientId;
        this._socket_send(wireMessage)
    };
    ClientImpl.prototype._on_socket_message = function(event) {
        this._trace("Client._on_socket_message", event.data);
        this.receivePinger.reset();
        var messages = this._deframeMessages(event.data);
        for (var i = 0; i < messages.length; i += 1) {
            this._handleMessage(messages[i])
        }
    }
    ClientImpl.prototype._deframeMessages = function(data) {
        var byteArray = new Uint8Array(data);
        if (this.receiveBuffer) {
            var newData = new Uint8Array(this.receiveBuffer.length + byteArray.length);
            newData.set(this.receiveBuffer);
            newData.set(byteArray, this.receiveBuffer.length);
            byteArray = newData;
            delete this.receiveBuffer
        }
        try {
            var offset = 0;
            var messages = [];
            while (offset < byteArray.length) {
                var result = decodeMessage(byteArray, offset);
                var wireMessage = result[0];
                offset = result[1];
                if (wireMessage !== null) {
                    messages.push(wireMessage)
                } else {
                    break
                }
            }
            if (offset < byteArray.length) {
                this.receiveBuffer = byteArray.subarray(offset)
            }
        } catch (error) {
            var errorStack = ((error.hasOwnProperty('stack') == 'undefined') ? error.stack.toString() : "No Error Stack Available");
            this._disconnected(ERROR.INTERNAL_ERROR.code, format(ERROR.INTERNAL_ERROR, [error.message, errorStack]));
            return
        }
        return messages
    }
    ClientImpl.prototype._handleMessage = function(wireMessage) {
        this._trace("Client._handleMessage", wireMessage);
        try {
            switch (wireMessage.type) {
            case MESSAGE_TYPE.CONNACK:
                this._connectTimeout.cancel();
                if (this.connectOptions.cleanSession) {
                    for (var key in this._sentMessages) {
                        var sentMessage = this._sentMessages[key];
                        wx.removeStorageSync("Sent:" + this._localKey + sentMessage.messageIdentifier)
                    }
                    this._sentMessages = {};
                    for (var key in this._receivedMessages) {
                        var receivedMessage = this._receivedMessages[key];
                        wx.removeStorageSync("Received:" + this._localKey + receivedMessage.messageIdentifier)
                    }
                    this._receivedMessages = {}
                }
                if (wireMessage.returnCode === 0) {
                    this.connected = true;
                    if (this.connectOptions.uris) this.hostIndex = this.connectOptions.uris.length
                } else {
                    this._disconnected(ERROR.CONNACK_RETURNCODE.code, format(ERROR.CONNACK_RETURNCODE, [wireMessage.returnCode, CONNACK_RC[wireMessage.returnCode]]));
                    break
                }
                var sequencedMessages = new Array();
                for (var msgId in this._sentMessages) {
                    if (this._sentMessages.hasOwnProperty(msgId)) sequencedMessages.push(this._sentMessages[msgId])
                }
                var sequencedMessages = sequencedMessages.sort(function(a, b) {
                    return a.sequence - b.sequence
                });
                for (var i = 0, len = sequencedMessages.length; i < len; i++) {
                    var sentMessage = sequencedMessages[i];
                    if (sentMessage.type == MESSAGE_TYPE.PUBLISH && sentMessage.pubRecReceived) {
                        var pubRelMessage = new WireMessage(MESSAGE_TYPE.PUBREL, {
                            messageIdentifier: sentMessage.messageIdentifier
                        });
                        this._schedule_message(pubRelMessage)
                    } else {
                        this._schedule_message(sentMessage)
                    }
                }
                if (this.connectOptions.onSuccess) {
                    this.connectOptions.onSuccess({
                        invocationContext: this.connectOptions.invocationContext
                    })
                }
                this._process_queue();
                break;
            case MESSAGE_TYPE.PUBLISH:
                this._receivePublish(wireMessage);
                break;
            case MESSAGE_TYPE.PUBACK:
                var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
                if (sentMessage) {
                    delete this._sentMessages[wireMessage.messageIdentifier];
                    wx.removeStorageSync("Sent:" + this._localKey + wireMessage.messageIdentifier);
                    if (this.onMessageDelivered) this.onMessageDelivered(sentMessage.payloadMessage)
                }
                break;
            case MESSAGE_TYPE.PUBREC:
                var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
                if (sentMessage) {
                    sentMessage.pubRecReceived = true;
                    var pubRelMessage = new WireMessage(MESSAGE_TYPE.PUBREL, {
                        messageIdentifier: wireMessage.messageIdentifier
                    });
                    this.store("Sent:", sentMessage);
                    this._schedule_message(pubRelMessage)
                }
                break;
            case MESSAGE_TYPE.PUBREL:
                var receivedMessage = this._receivedMessages[wireMessage.messageIdentifier];
                wx.removeStorageSync("Received:" + this._localKey + wireMessage.messageIdentifier);
                if (receivedMessage) {
                    this._receiveMessage(receivedMessage);
                    delete this._receivedMessages[wireMessage.messageIdentifier]
                }
                var pubCompMessage = new WireMessage(MESSAGE_TYPE.PUBCOMP, {
                    messageIdentifier: wireMessage.messageIdentifier
                });
                this._schedule_message(pubCompMessage);
                break;
            case MESSAGE_TYPE.PUBCOMP:
                var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
                delete this._sentMessages[wireMessage.messageIdentifier];
                wx.removeStorageSync("Sent:" + this._localKey + wireMessage.messageIdentifier);
                if (this.onMessageDelivered) this.onMessageDelivered(sentMessage.payloadMessage);
                break;
            case MESSAGE_TYPE.SUBACK:
                var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
                if (sentMessage) {
                    if (sentMessage.timeOut) sentMessage.timeOut.cancel();
                    if (wireMessage.returnCode[0] === 0x80) {
                        if (sentMessage.onFailure) {
                            sentMessage.onFailure(wireMessage.returnCode)
                        }
                    } else if (sentMessage.onSuccess) {
                        sentMessage.onSuccess(wireMessage.returnCode)
                    }
                    delete this._sentMessages[wireMessage.messageIdentifier]
                }
                break;
            case MESSAGE_TYPE.UNSUBACK:
                var sentMessage = this._sentMessages[wireMessage.messageIdentifier];
                if (sentMessage) {
                    if (sentMessage.timeOut) sentMessage.timeOut.cancel();
                    if (sentMessage.callback) {
                        sentMessage.callback()
                    }
                    delete this._sentMessages[wireMessage.messageIdentifier]
                }
                break;
            case MESSAGE_TYPE.PINGRESP:
                this.sendPinger.reset();
                break;
            case MESSAGE_TYPE.DISCONNECT:
                this._disconnected(ERROR.INVALID_MQTT_MESSAGE_TYPE.code, format(ERROR.INVALID_MQTT_MESSAGE_TYPE, [wireMessage.type]));
                break;
            default:
                this._disconnected(ERROR.INVALID_MQTT_MESSAGE_TYPE.code, format(ERROR.INVALID_MQTT_MESSAGE_TYPE, [wireMessage.type]))
            }
        } catch (error) {
            var errorStack = ((error.hasOwnProperty('stack') == 'undefined') ? error.stack.toString() : "No Error Stack Available");
            this._disconnected(ERROR.INTERNAL_ERROR.code, format(ERROR.INTERNAL_ERROR, [error.message, errorStack]));
            return
        }
    };
    ClientImpl.prototype._on_socket_error = function(error) {
        this._disconnected(ERROR.SOCKET_ERROR.code, format(ERROR.SOCKET_ERROR, [error.data]))
    };
    ClientImpl.prototype._on_socket_close = function() {
        this._disconnected(ERROR.SOCKET_CLOSE.code, format(ERROR.SOCKET_CLOSE))
    };
    ClientImpl.prototype._socket_send = function(wireMessage) {
        if (wireMessage.type == 1) {
            var wireMessageMasked = this._traceMask(wireMessage, "password");
            this._trace("Client._socket_send", wireMessageMasked)
        } else this._trace("Client._socket_send", wireMessage);
        wx.sendSocketMessage({
            data: wireMessage.encode(),
            success: function() {
                console.log('Success send message')
            }
        });
        this.sendPinger.reset()
    };
    ClientImpl.prototype._receivePublish = function(wireMessage) {
        switch (wireMessage.payloadMessage.qos) {
        case "undefined":
        case 0:
            this._receiveMessage(wireMessage);
            break;
        case 1:
            var pubAckMessage = new WireMessage(MESSAGE_TYPE.PUBACK, {
                messageIdentifier: wireMessage.messageIdentifier
            });
            this._schedule_message(pubAckMessage);
            this._receiveMessage(wireMessage);
            break;
        case 2:
            this._receivedMessages[wireMessage.messageIdentifier] = wireMessage;
            this.store("Received:", wireMessage);
            var pubRecMessage = new WireMessage(MESSAGE_TYPE.PUBREC, {
                messageIdentifier: wireMessage.messageIdentifier
            });
            this._schedule_message(pubRecMessage);
            break;
        default:
            throw Error("Invaild qos=" + wireMmessage.payloadMessage.qos);
        }
    };
    ClientImpl.prototype._receiveMessage = function(wireMessage) {
        if (this.onMessageArrived) {
            this.onMessageArrived(wireMessage.payloadMessage)
        }
    };
    ClientImpl.prototype._disconnected = function(errorCode, errorText) {
        this._trace("Client._disconnected", errorCode, errorText);
        this.sendPinger.cancel();
        this.receivePinger.cancel();
        if (this._connectTimeout) this._connectTimeout.cancel();
        this._msg_queue = [];
        this._notify_msg_sent = {};
        if (this.socket) {
            this.socket.onopen = null;
            this.socket.onmessage = null;
            this.socket.onerror = null;
            this.socket.onclose = null;
            if (this.socket.readyState === 1) this.socket.close();
            delete this.socket
        }
        if (this.connectOptions.uris && this.hostIndex < this.connectOptions.uris.length - 1) {
            this.hostIndex++;
            this._doConnect(this.connectOptions.uris[this.hostIndex])
        } else {
            if (errorCode === undefined) {
                errorCode = ERROR.OK.code;
                errorText = format(ERROR.OK)
            }
            if (this.connected) {
                this.connected = false;
                if (this.onConnectionLost) this.onConnectionLost({
                    errorCode: errorCode,
                    errorMessage: errorText
                })
            } else {
                if (this.connectOptions.mqttVersion === 4 && this.connectOptions.mqttVersionExplicit === false) {
                    this._trace("Failed to connect V4, dropping back to V3");
                    this.connectOptions.mqttVersion = 3;
                    if (this.connectOptions.uris) {
                        this.hostIndex = 0;
                        this._doConnect(this.connectOptions.uris[0])
                    } else {
                        this._doConnect(this.uri)
                    }
                } else if (this.connectOptions.onFailure) {
                    this.connectOptions.onFailure({
                        invocationContext: this.connectOptions.invocationContext,
                        errorCode: errorCode,
                        errorMessage: errorText
                    })
                }
            }
        }
    };
    ClientImpl.prototype._trace = function() {
        if (this.traceFunction) {
            for (var i in arguments) {
                if (typeof arguments[i] !== "undefined") arguments[i] = JSON.stringify(arguments[i])
            }
            var record = Array.prototype.slice.call(arguments).join("");
            this.traceFunction({
                severity: "Debug",
                message: record
            })
        }
        if (this._traceBuffer !== null) {
            for (var i = 0, max = arguments.length; i < max; i++) {
                if (this._traceBuffer.length == this._MAX_TRACE_ENTRIES) {
                    this._traceBuffer.shift()
                }
                if (i === 0) this._traceBuffer.push(arguments[i]);
                else if (typeof arguments[i] === "undefined") this._traceBuffer.push(arguments[i]);
                else this._traceBuffer.push("  " + JSON.stringify(arguments[i]))
            }
        }
    };
    ClientImpl.prototype._traceMask = function(traceObject, masked) {
        var traceObjectMasked = {};
        for (var attr in traceObject) {
            if (traceObject.hasOwnProperty(attr)) {
                if (attr == masked) traceObjectMasked[attr] = "******";
                else traceObjectMasked[attr] = traceObject[attr]
            }
        }
        return traceObjectMasked
    };
    var Client = function(host, port, path, clientId) {
            var uri;
            if (typeof host !== "string") throw new Error(format(ERROR.INVALID_TYPE, [typeof host, "host"]));
            if (arguments.length == 2) {
                clientId = port;
                uri = host;
                var match = uri.match(/^(wss?):\/\/((\[(.+)\])|([^\/]+?))(:(\d+))?(\/.*)$/);
                if (match) {
                    host = match[4] || match[2];
                    port = parseInt(match[7]);
                    path = match[8]
                } else {
                    throw new Error(format(ERROR.INVALID_ARGUMENT, [host, "host"]));
                }
            } else {
                if (arguments.length == 3) {
                    clientId = path;
                    path = "/mqtt"
                }
                if (typeof port !== "number" || port < 0) throw new Error(format(ERROR.INVALID_TYPE, [typeof port, "port"]));
                if (typeof path !== "string") throw new Error(format(ERROR.INVALID_TYPE, [typeof path, "path"]));
                var ipv6AddSBracket = (host.indexOf(":") != -1 && host.slice(0, 1) != "[" && host.slice(-1) != "]");
                uri = "ws://" + (ipv6AddSBracket ? "[" + host + "]" : host) + ":" + port + path
            }
            var clientIdLength = 0;
            for (var i = 0; i < clientId.length; i++) {
                var charCode = clientId.charCodeAt(i);
                if (0xD800 <= charCode && charCode <= 0xDBFF) {
                    i++
                }
                clientIdLength++
            }
            if (typeof clientId !== "string" || clientIdLength > 65535) throw new Error(format(ERROR.INVALID_ARGUMENT, [clientId, "clientId"]));
            var client = new ClientImpl(uri, host, port, path, clientId);
            this._getHost = function() {
                return host
            };
            this._setHost = function() {
                throw new Error(format(ERROR.UNSUPPORTED_OPERATION));
            };
            this._getPort = function() {
                return port
            };
            this._setPort = function() {
                throw new Error(format(ERROR.UNSUPPORTED_OPERATION));
            };
            this._getPath = function() {
                return path
            };
            this._setPath = function() {
                throw new Error(format(ERROR.UNSUPPORTED_OPERATION));
            };
            this._getURI = function() {
                return uri
            };
            this._setURI = function() {
                throw new Error(format(ERROR.UNSUPPORTED_OPERATION));
            };
            this._getClientId = function() {
                return client.clientId
            };
            this._setClientId = function() {
                throw new Error(format(ERROR.UNSUPPORTED_OPERATION));
            };
            this._getOnConnectionLost = function() {
                return client.onConnectionLost
            };
            this._setOnConnectionLost = function(newOnConnectionLost) {
                if (typeof newOnConnectionLost === "function") client.onConnectionLost = newOnConnectionLost;
                else throw new Error(format(ERROR.INVALID_TYPE, [typeof newOnConnectionLost, "onConnectionLost"]));
            };
            this._getOnMessageDelivered = function() {
                return client.onMessageDelivered
            };
            this._setOnMessageDelivered = function(newOnMessageDelivered) {
                if (typeof newOnMessageDelivered === "function") client.onMessageDelivered = newOnMessageDelivered;
                else throw new Error(format(ERROR.INVALID_TYPE, [typeof newOnMessageDelivered, "onMessageDelivered"]));
            };
            this._getOnMessageArrived = function() {
                return client.onMessageArrived
            };
            this._setOnMessageArrived = function(newOnMessageArrived) {
                if (typeof newOnMessageArrived === "function") client.onMessageArrived = newOnMessageArrived;
                else throw new Error(format(ERROR.INVALID_TYPE, [typeof newOnMessageArrived, "onMessageArrived"]));
            };
            this._getTrace = function() {
                return client.traceFunction
            };
            this._setTrace = function(trace) {
                if (typeof trace === "function") {
                    client.traceFunction = trace
                } else {
                    throw new Error(format(ERROR.INVALID_TYPE, [typeof trace, "onTrace"]));
                }
            };
            this.connect = function(connectOptions) {
                connectOptions = connectOptions || {};
                validate(connectOptions, {
                    timeout: "number",
                    userName: "string",
                    password: "string",
                    willMessage: "object",
                    keepAliveInterval: "number",
                    cleanSession: "boolean",
                    useSSL: "boolean",
                    invocationContext: "object",
                    onSuccess: "function",
                    onFailure: "function",
                    hosts: "object",
                    ports: "object",
                    mqttVersion: "number"
                });
                if (connectOptions.keepAliveInterval === undefined) connectOptions.keepAliveInterval = 60;
                if (connectOptions.mqttVersion > 4 || connectOptions.mqttVersion < 3) {
                    throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.mqttVersion, "connectOptions.mqttVersion"]));
                }
                if (connectOptions.mqttVersion === undefined) {
                    connectOptions.mqttVersionExplicit = false;
                    connectOptions.mqttVersion = 4;
                } else {
                    connectOptions.mqttVersionExplicit = true;
                }
                if (connectOptions.password === undefined && connectOptions.userName !== undefined) throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.password, "connectOptions.password"])); if (connectOptions.willMessage) {
                    if (!(connectOptions.willMessage instanceof Message)) throw new Error(format(ERROR.INVALID_TYPE, [connectOptions.willMessage, "connectOptions.willMessage"]));
                    connectOptions.willMessage.stringPayload;
                    if (typeof connectOptions.willMessage.destinationName === "undefined") throw new Error(format(ERROR.INVALID_TYPE, [typeof connectOptions.willMessage.destinationName, "connectOptions.willMessage.destinationName"]));
                }
                if (typeof connectOptions.cleanSession === "undefined") connectOptions.cleanSession = true;
                if (connectOptions.hosts) {
                    if (!(connectOptions.hosts instanceof Array)) throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.hosts, "connectOptions.hosts"]));
                    if (connectOptions.hosts.length < 1) throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.hosts, "connectOptions.hosts"]));
                    var usingURIs = false;
                    for (var i = 0; i < connectOptions.hosts.length; i++) {
                        if (typeof connectOptions.hosts[i] !== "string") throw new Error(format(ERROR.INVALID_TYPE, [typeof connectOptions.hosts[i], "connectOptions.hosts[" + i + "]"]));
                        if (/^(wss?):\/\/((\[(.+)\])|([^\/]+?))(:(\d+))?(\/.*)$/.test(connectOptions.hosts[i])) {
                            if (i == 0) {
                                usingURIs = true
                            } else if (!usingURIs) {
                                throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.hosts[i], "connectOptions.hosts[" + i + "]"]));
                            }
                        } else if (usingURIs) {
                            throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.hosts[i], "connectOptions.hosts[" + i + "]"]));
                        }
                    }
                    if (!usingURIs) {
                        if (!connectOptions.ports) throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.ports, "connectOptions.ports"]));
                        if (!(connectOptions.ports instanceof Array)) throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.ports, "connectOptions.ports"]));
                        if (connectOptions.hosts.length != connectOptions.ports.length) throw new Error(format(ERROR.INVALID_ARGUMENT, [connectOptions.ports, "connectOptions.ports"]));
                        connectOptions.uris = [];
                        for (var i = 0; i < connectOptions.hosts.length; i++) {
                            if (typeof connectOptions.ports[i] !== "number" || connectOptions.ports[i] < 0) throw new Error(format(ERROR.INVALID_TYPE, [typeof connectOptions.ports[i], "connectOptions.ports[" + i + "]"]));
                            var host = connectOptions.hosts[i];
                            var port = connectOptions.ports[i];
                            var ipv6 = (host.indexOf(":") != -1);
                            uri = "ws://" + (ipv6 ? "[" + host + "]" : host) + ":" + port + path;
                            connectOptions.uris.push(uri)
                        }
                    } else {
                        connectOptions.uris = connectOptions.hosts
                    }
                }
                client.connect(connectOptions)
            };
            this.subscribe = function(filter, subscribeOptions) {
                if (typeof filter !== "string") throw new Error("Invalid argument:" + filter);
                subscribeOptions = subscribeOptions || {};
                validate(subscribeOptions, {
                    qos: "number",
                    invocationContext: "object",
                    onSuccess: "function",
                    onFailure: "function",
                    timeout: "number"
                });
                if (subscribeOptions.timeout && !subscribeOptions.onFailure) throw new Error("subscribeOptions.timeout specified with no onFailure callback.");
                if (typeof subscribeOptions.qos !== "undefined" && !(subscribeOptions.qos === 0 || subscribeOptions.qos === 1 || subscribeOptions.qos === 2)) throw new Error(format(ERROR.INVALID_ARGUMENT, [subscribeOptions.qos, "subscribeOptions.qos"]));
                client.subscribe(filter, subscribeOptions)
            };
            this.unsubscribe = function(filter, unsubscribeOptions) {
                if (typeof filter !== "string") throw new Error("Invalid argument:" + filter);
                unsubscribeOptions = unsubscribeOptions || {};
                validate(unsubscribeOptions, {
                    invocationContext: "object",
                    onSuccess: "function",
                    onFailure: "function",
                    timeout: "number"
                });
                if (unsubscribeOptions.timeout && !unsubscribeOptions.onFailure) throw new Error("unsubscribeOptions.timeout specified with no onFailure callback.");
                client.unsubscribe(filter, unsubscribeOptions)
            };
            this.send = function(topic, payload, qos, retained) {
                var message;
                if (arguments.length == 0) {
                    throw new Error("Invalid argument." + "length");
                } else if (arguments.length == 1) {
                    if (!(topic instanceof Message) && (typeof topic !== "string")) throw new Error("Invalid argument:" + typeof topic);
                    message = topic;
                    if (typeof message.destinationName === "undefined") throw new Error(format(ERROR.INVALID_ARGUMENT, [message.destinationName, "Message.destinationName"]));
                    client.send(message)
                } else {
                    message = new Message(payload);
                    message.destinationName = topic;
                    if (arguments.length >= 3) message.qos = qos;
                    if (arguments.length >= 4) message.retained = retained;
                    client.send(message)
                }
            };
            this.disconnect = function() {
                client.disconnect()
            };
            this.getTraceLog = function() {
                return client.getTraceLog()
            }
            this.startTrace = function() {
                client.startTrace()
            };
            this.stopTrace = function() {
                client.stopTrace()
            };
            this.isConnected = function() {
                return client.connected
            }
        };
    Client.prototype = {
        get host() {
            return this._getHost()
        }, set host(newHost) {
            this._setHost(newHost)
        }, get port() {
            return this._getPort()
        }, set port(newPort) {
            this._setPort(newPort)
        }, get path() {
            return this._getPath()
        }, set path(newPath) {
            this._setPath(newPath)
        }, get clientId() {
            return this._getClientId()
        }, set clientId(newClientId) {
            this._setClientId(newClientId)
        }, get onConnectionLost() {
            return this._getOnConnectionLost()
        }, set onConnectionLost(newOnConnectionLost) {
            this._setOnConnectionLost(newOnConnectionLost)
        }, get onMessageDelivered() {
            return this._getOnMessageDelivered()
        }, set onMessageDelivered(newOnMessageDelivered) {
            this._setOnMessageDelivered(newOnMessageDelivered)
        }, get onMessageArrived() {
            return this._getOnMessageArrived()
        }, set onMessageArrived(newOnMessageArrived) {
            this._setOnMessageArrived(newOnMessageArrived)
        }, get trace() {
            return this._getTrace()
        }, set trace(newTraceFunction) {
            this._setTrace(newTraceFunction)
        }
    };
    var Message = function(newPayload) {
            var payload;
            if (typeof newPayload === "string" || newPayload instanceof ArrayBuffer || newPayload instanceof Int8Array || newPayload instanceof Uint8Array || newPayload instanceof Int16Array || newPayload instanceof Uint16Array || newPayload instanceof Int32Array || newPayload instanceof Uint32Array || newPayload instanceof Float32Array || newPayload instanceof Float64Array) {
                payload = newPayload
            } else {
                throw (format(ERROR.INVALID_ARGUMENT, [newPayload, "newPayload"]));
            }
            this._getPayloadString = function() {
                if (typeof payload === "string") return payload;
                else return parseUTF8(payload, 0, payload.length)
            };
            this._getPayloadBytes = function() {
                if (typeof payload === "string") {
                    var buffer = new ArrayBuffer(UTF8Length(payload));
                    var byteStream = new Uint8Array(buffer);
                    stringToUTF8(payload, byteStream, 0);
                    return byteStream
                } else {
                    return payload
                }
            };
            var destinationName = undefined;
            this._getDestinationName = function() {
                return destinationName
            };
            this._setDestinationName = function(newDestinationName) {
                if (typeof newDestinationName === "string") destinationName = newDestinationName;
                else throw new Error(format(ERROR.INVALID_ARGUMENT, [newDestinationName, "newDestinationName"]));
            };
            var qos = 0;
            this._getQos = function() {
                return qos
            };
            this._setQos = function(newQos) {
                if (newQos === 0 || newQos === 1 || newQos === 2) qos = newQos;
                else throw new Error("Invalid argument:" + newQos);
            };
            var retained = false;
            this._getRetained = function() {
                return retained
            };
            this._setRetained = function(newRetained) {
                if (typeof newRetained === "boolean") retained = newRetained;
                else throw new Error(format(ERROR.INVALID_ARGUMENT, [newRetained, "newRetained"]));
            };
            var duplicate = false;
            this._getDuplicate = function() {
                return duplicate
            };
            this._setDuplicate = function(newDuplicate) {
                duplicate = newDuplicate
            }
        };
    Message.prototype = {
        get payloadString() {
            return this._getPayloadString()
        }, get payloadBytes() {
            return this._getPayloadBytes()
        }, get destinationName() {
            return this._getDestinationName()
        }, set destinationName(newDestinationName) {
            this._setDestinationName(newDestinationName)
        }, get qos() {
            return this._getQos()
        }, set qos(newQos) {
            this._setQos(newQos)
        }, get retained() {
            return this._getRetained()
        }, set retained(newRetained) {
            this._setRetained(newRetained)
        }, get duplicate() {
            return this._getDuplicate()
        }, set duplicate(newDuplicate) {
            this._setDuplicate(newDuplicate)
        }
    };
    return {
        Client: Client,
        Message: Message
    }
})(wx);
module.exports = Paho;