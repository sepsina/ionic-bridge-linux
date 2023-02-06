/* eslint-disable object-shorthand */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/prefer-for-of */
/* eslint-disable no-bitwise */
import { Injectable, NgZone } from '@angular/core';
import { Serial, SerialOpenOptions, SerialPermissionOptions } from '@ionic-native/serial/ngx';
import { EventsService } from './events.service';
import { UtilsService } from './utils.service';

import * as gConst from '../gConst';
import * as gIF from '../gIF';

@Injectable({
    providedIn: 'root',
})
export class PortService {

    hostCmdQueue: gIF.hostCmd_t[] = [];
    hostCmdFlag = false;
    hostCmdTmoRef;
    private runTmoRef = null;

    private crc = 0;
    private calcCRC = 0;
    private msgIdx = 0;
    private isEsc = false;
    private rxBuf = new ArrayBuffer(1024);
    private rxMsg = new Uint8Array(this.rxBuf);
    private rxState = gIF.eRxState.E_STATE_RX_WAIT_START;

    private msgType = 0;
    private msgLen = 0;

    private seqNum = 0;

    constructor(private serial: Serial,
                private events: EventsService,
                private utils: UtilsService) {
        this.events.subscribe('wr_bind', (bind)=>{
            this.wrBind(bind);
        });
        this.events.subscribe('zcl_cmd', (cmd)=>{
            this.udpZclCmd(cmd);
        });
    }

    /***********************************************************************************************
     * fn          openComPort
     *
     * brief
     *
     */
    public async openComPort() {

        const serialPermOpt = {} as SerialPermissionOptions;
        serialPermOpt.vid = '0403';
        serialPermOpt.pid = '6015'; // 6015->FT231XS, 6001->FT232RL
        serialPermOpt.driver = 'FtdiSerialDriver';

        const serialOpenOpt = {} as SerialOpenOptions;
        serialOpenOpt.baudRate = 115200;
        serialOpenOpt.dataBits = 8;
        serialOpenOpt.stopBits = 1;
        serialOpenOpt.parity = 0;
        serialOpenOpt.dtr = true;
        serialOpenOpt.rts = true;
        serialOpenOpt.sleepOnPause = false;

        try {
            await this.serial.requestPermission(serialPermOpt);
            try {
                await this.serial.open(serialOpenOpt);
                this.utils.sendMsg('Serial connection opened');
                this.serial.registerReadCallback().subscribe((data)=>{
                    this.slOnData(data);
                });
            }
            catch(err) {
                this.utils.sendMsg(`open serial err: ${err}`, 'red');
            }
        }
        catch(err) {
            this.utils.sendMsg(`req permission err: ${err}`, 'red');
        }
    }

    /***********************************************************************************************
     * fn          slOnData
     *
     * brief
     *
     */
    public slOnData(msg) {

        const pkt = new Uint8Array(msg);

        for(let i = 0; i < pkt.length; i++) {
            let rxByte = pkt[i];
            switch(rxByte) {
                case gConst.SL_START_CHAR: {
                    this.msgIdx = 0;
                    this.isEsc = false;
                    this.rxState = gIF.eRxState.E_STATE_RX_WAIT_TYPELSB;
                    break;
                }
                case gConst.SL_ESC_CHAR: {
                    this.isEsc = true;
                    break;
                }
                case gConst.SL_END_CHAR: {
                    if(this.crc === this.calcCRC) {
                        const slMsg: gIF.slMsg_t = {
                            type: this.msgType,
                            data: Array.from(this.rxMsg).slice(0, this.msgIdx),
                        };
                        setTimeout(()=>{
                            this.processMsg(slMsg);
                        }, 0);
                    }
                    this.rxState = gIF.eRxState.E_STATE_RX_WAIT_START;
                    break;
                }
                default: {
                    if(this.isEsc === true) {
                        rxByte ^= 0x10;
                        this.isEsc = false;
                    }
                    switch(this.rxState) {
                        case gIF.eRxState.E_STATE_RX_WAIT_START: {
                            // ---
                            break;
                        }
                        case gIF.eRxState.E_STATE_RX_WAIT_TYPELSB: {
                            this.msgType = rxByte;
                            this.rxState = gIF.eRxState.E_STATE_RX_WAIT_TYPEMSB;
                            this.calcCRC = rxByte;
                            break;
                        }
                        case gIF.eRxState.E_STATE_RX_WAIT_TYPEMSB: {
                            this.msgType += rxByte << 8;
                            this.rxState = gIF.eRxState.E_STATE_RX_WAIT_LENLSB;
                            this.calcCRC ^= rxByte;
                            break;
                        }
                        case gIF.eRxState.E_STATE_RX_WAIT_LENLSB: {
                            this.msgLen = rxByte;
                            this.rxState = gIF.eRxState.E_STATE_RX_WAIT_LENMSB;
                            this.calcCRC ^= rxByte;
                            break;
                        }
                        case gIF.eRxState.E_STATE_RX_WAIT_LENMSB: {
                            this.msgLen += rxByte << 8;
                            this.rxState = gIF.eRxState.E_STATE_RX_WAIT_CRC;
                            this.calcCRC ^= rxByte;
                            break;
                        }
                        case gIF.eRxState.E_STATE_RX_WAIT_CRC: {
                            this.crc = rxByte;
                            this.rxState = gIF.eRxState.E_STATE_RX_WAIT_DATA;
                            break;
                        }
                        case gIF.eRxState.E_STATE_RX_WAIT_DATA: {
                            if(this.msgIdx < this.msgLen) {
                                this.rxMsg[this.msgIdx++] = rxByte;
                                this.calcCRC ^= rxByte;
                            }
                            break;
                        }
                    }
                }
            }
        }
    }

    /***********************************************************************************************
     * fn          processMsg
     *
     * brief
     *
     */
    processMsg(msg: gIF.slMsg_t) {

        const msgData = new Uint8Array(msg.data);

        switch(msg.type) {
            case gConst.SL_MSG_TESTPORT: {
                const msgView = new DataView(msgData.buffer);
                let msgIdx = 0;
                const msgSeqNum = msgView.getUint8(msgIdx++);
                if(msgSeqNum === this.seqNum) {
                    const testData = msgView.getUint32(msgIdx, gConst.LE);
                    if(testData === 0x67190110) {
                        // ---
                    }
                }
                break;
            }
            case gConst.SL_MSG_HOST_ANNCE: {
                const dataHost = {} as gIF.dataHost_t;
                const msgView = new DataView(msgData.buffer);
                let msgIdx = 0;
                dataHost.shortAddr = msgView.getUint16(msgIdx, gConst.LE);
                msgIdx += 2;
                dataHost.extAddr = msgView.getFloat64(msgIdx, gConst.LE);
                msgIdx += 8;
                dataHost.numAttrSets = msgView.getUint8(msgIdx++);
                dataHost.numSrcBinds = msgView.getUint8(msgIdx++);
                const ttl = msgView.getUint16(msgIdx, gConst.LE);

                //let logMsg = this.utils.timeStamp();
                let logMsg = ` host -> short: 0x${dataHost.shortAddr.toString(16).padStart(4, '0').toUpperCase()},`;
                logMsg += ` ext: ${this.utils.extToHex(dataHost.extAddr)},`;
                logMsg += ` numAttr: ${dataHost.numAttrSets},`;
                logMsg += ` numBinds: ${dataHost.numSrcBinds}`;
                this.utils.sendMsg(logMsg);

                if(this.hostCmdQueue.length > 15) {
                    this.hostCmdQueue = [];
                    this.hostCmdFlag = false;
                }

                if(dataHost.numAttrSets > 0) {
                    const cmd: gIF.hostCmd_t = {
                        shortAddr: dataHost.shortAddr,
                        type: gConst.RD_ATTR,
                        idx: 0,
                        retryCnt: gConst.RD_HOST_RETRY_CNT,
                        param: '',
                    };
                    this.hostCmdQueue.push(cmd);
                }
                if(dataHost.numSrcBinds > 0) {
                    const cmd: gIF.hostCmd_t = {
                        shortAddr: dataHost.shortAddr,
                        type: gConst.RD_BIND,
                        idx: 0,
                        retryCnt: gConst.RD_HOST_RETRY_CNT,
                        param: '',
                    };
                    this.hostCmdQueue.push(cmd);
                }
                if(this.hostCmdQueue.length > 0) {
                    if(this.hostCmdFlag === false) {
                        this.hostCmdFlag = true;
                        this.runHostCmd();
                    }
                    if(this.runTmoRef === null) {
                        this.runTmoRef = setTimeout(() => {
                            this.runTmoRef = null;
                            this.hostCmdFlag = true;
                            this.runHostCmd();
                        }, 3000);
                    }
                }
                break;
            }
            case gConst.SL_MSG_LOG: {
                const idx = msgData.indexOf(10);
                if(idx > -1) {
                    msgData[idx] = 32;
                }
                this.utils.sendMsg(String.fromCharCode.apply(null, msgData));
                break;
            }
            case gConst.SL_MSG_READ_ATTR_SET_AT_IDX: {
                const rxSet = {} as gIF.attrSet_t;
                const msgView = new DataView(msgData.buffer);
                let msgIdx = 0;
                const msgSeqNum = msgView.getUint8(msgIdx++);
                if(msgSeqNum === this.seqNum) {
                    rxSet.hostShortAddr = this.hostCmdQueue[0].shortAddr;
                    const status = msgView.getUint8(msgIdx++);
                    if(status === gConst.SL_CMD_OK) {
                        const memIdx = msgView.getUint8(msgIdx++);
                        rxSet.partNum = msgView.getUint32(msgIdx, gConst.LE);
                        msgIdx += 4;
                        rxSet.clusterServer = msgView.getUint8(msgIdx++);
                        rxSet.extAddr = msgView.getFloat64(msgIdx, gConst.LE);
                        msgIdx += 8;
                        rxSet.shortAddr = msgView.getUint16(msgIdx, gConst.LE);
                        msgIdx += 2;
                        rxSet.endPoint = msgView.getUint8(msgIdx++);
                        rxSet.clusterID = msgView.getUint16(msgIdx, gConst.LE);
                        msgIdx += 2;
                        rxSet.attrSetID = msgView.getUint16(msgIdx, gConst.LE);
                        msgIdx += 2;
                        rxSet.attrMap = msgView.getUint16(msgIdx, gConst.LE);
                        msgIdx += 2;
                        rxSet.valsLen = msgView.getUint8(msgIdx++);
                        rxSet.attrVals = [];
                        for(let i = 0; i < rxSet.valsLen; i++) {
                            rxSet.attrVals[i] = msgView.getUint8(msgIdx++);
                        }

                        this.events.publish('attr_set', JSON.stringify(rxSet));

                        const cmd = this.hostCmdQueue.shift();
                        cmd.idx = memIdx + 1;
                        cmd.retryCnt = gConst.RD_HOST_RETRY_CNT;
                        this.hostCmdQueue.push(cmd);
                        this.runHostCmd();
                    }
                    else {
                        this.hostCmdQueue.shift();
                        if(this.hostCmdQueue.length > 0) {
                            this.runHostCmd();
                        }
                        else {
                            this.seqNum = ++this.seqNum % 256;
                            clearTimeout(this.hostCmdTmoRef);
                            this.hostCmdFlag = false;
                        }
                    }
                }
                break;
            }
            case gConst.SL_MSG_READ_BIND_AT_IDX: {
                const rxBind = {} as gIF.clusterBind_t;
                const msgView = new DataView(msgData.buffer);
                let msgIdx = 0;
                const msgSeqNum = msgView.getUint8(msgIdx++);
                if(msgSeqNum === this.seqNum) {
                    rxBind.hostShortAddr = this.hostCmdQueue[0].shortAddr;
                    const status = msgView.getUint8(msgIdx++);
                    if(status === gConst.SL_CMD_OK) {
                        const memIdx = msgView.getUint8(msgIdx++);
                        rxBind.partNum = msgView.getUint32(msgIdx, gConst.LE);
                        msgIdx += 4;
                        rxBind.extAddr = msgView.getFloat64(msgIdx, gConst.LE);
                        msgIdx += 8;
                        rxBind.srcShortAddr = msgView.getUint16(msgIdx, gConst.LE);
                        msgIdx += 2;
                        rxBind.srcEP = msgView.getUint8(msgIdx++);
                        rxBind.clusterID = msgView.getUint16(msgIdx, gConst.LE);
                        msgIdx += 2;
                        rxBind.dstExtAddr = msgView.getFloat64(msgIdx, gConst.LE);
                        msgIdx += 8;
                        rxBind.dstEP = msgView.getUint8(msgIdx++);

                        this.events.publish('cluster_bind', JSON.stringify(rxBind));

                        const cmd = this.hostCmdQueue.shift();
                        cmd.idx = memIdx + 1;
                        cmd.retryCnt = gConst.RD_HOST_RETRY_CNT;
                        this.hostCmdQueue.push(cmd);
                        this.runHostCmd();
                    }
                    else {
                        this.hostCmdQueue.shift();
                        if(this.hostCmdQueue.length > 0) {
                            this.runHostCmd();
                        }
                        else {
                            this.seqNum = ++this.seqNum % 256;
                            clearTimeout(this.hostCmdTmoRef);
                            this.hostCmdFlag = false;
                        }
                    }
                }
                break;
            }
            case gConst.SL_MSG_WRITE_BIND: {
                const msgView = new DataView(msgData.buffer);
                let msgIdx = 0;
                const msgSeqNum = msgView.getUint8(msgIdx++);
                if(msgSeqNum === this.seqNum) {
                    const status = msgView.getUint8(msgIdx++);
                    if(status === gConst.SL_CMD_OK) {
                        console.log('wr binds status: OK');
                    }
                    else {
                        console.log('wr binds status: FAIL');
                    }
                    this.hostCmdQueue.shift();
                    if(this.hostCmdQueue.length > 0) {
                        this.runHostCmd();
                    }
                    else {
                        this.seqNum = ++this.seqNum % 256;
                        clearTimeout(this.hostCmdTmoRef);
                        this.hostCmdFlag = false;
                    }
                }
                break;
            }
            case gConst.SL_MSG_ZCL_CMD: {
                const msgView = new DataView(msgData.buffer);
                let msgIdx = 0;
                const msgSeqNum = msgView.getUint8(msgIdx++);
                if(msgSeqNum === this.seqNum) {
                    // TODO
                    this.hostCmdQueue.shift();
                    if(this.hostCmdQueue.length > 0) {
                        this.runHostCmd();
                    }
                    else {
                        this.seqNum = ++this.seqNum % 256;
                        clearTimeout(this.hostCmdTmoRef);
                        this.hostCmdFlag = false;
                    }
                }
                break;
            }
            default: {
                console.log('unsupported sl command!');
                break;
            }
        }
    }

    /***********************************************************************************************
     * fn          runHostCmd
     *
     * brief
     *
     */
    async runHostCmd() {

        clearTimeout(this.hostCmdTmoRef);

        if(this.runTmoRef) {
            clearTimeout(this.runTmoRef);
            this.runTmoRef = null;
        }

        const hostCmd = this.hostCmdQueue[0];
        if(hostCmd) {
            switch(hostCmd.type) {
                case gConst.RD_ATTR: {
                    await this.reqAttrAtIdx();
                    break;
                }
                case gConst.RD_BIND: {
                    await this.reqBindAtIdx();
                    break;
                }
                case gConst.WR_BIND: {
                    await this.wrBindReq();
                    break;
                }
                case gConst.ZCL_CMD: {
                    await this.zclReq();
                    break;
                }
            }
        }

        this.hostCmdTmoRef = setTimeout(()=>{
            this.hostCmdTmo();
        }, gConst.RD_HOST_TMO);
    }

    /***********************************************************************************************
     * fn          hostCmdTmo
     *
     * brief
     *
     */
    async hostCmdTmo() {

        this.utils.sendMsg('--- READ_HOST_TMO ---', 'red');

        if(this.hostCmdQueue.length === 0) {
            this.hostCmdFlag = false;
            return;
        }
        const hostCmd = this.hostCmdQueue.shift();
        if(hostCmd.retryCnt) {
            hostCmd.retryCnt--;
            this.hostCmdQueue.push(hostCmd);
        }
        if(this.hostCmdQueue.length === 0) {
            this.hostCmdFlag = false;
            return;
        }

        const cmd = this.hostCmdQueue[0];
        switch(cmd.type) {
            case gConst.RD_ATTR: {
                await this.reqAttrAtIdx();
                break;
            }
            case gConst.RD_BIND: {
                await this.reqBindAtIdx();
                break;
            }
            case gConst.WR_BIND: {
                await this.wrBindReq();
                break;
            }
            case gConst.ZCL_CMD: {
                await this.zclReq();
                break;
            }
        }

        this.hostCmdTmoRef = setTimeout(()=>{
            this.hostCmdTmo();
        }, gConst.RD_HOST_TMO);
    }

    /***********************************************************************************************
     * fn          reqAttrAtIdx
     *
     * brief
     *
     */
    private async reqAttrAtIdx() {

        const hostCmd = this.hostCmdQueue[0];
        if(hostCmd.shortAddr === undefined) {
            console.log('--- REQ_ATTR_AT_IDX HOST UNDEFINED ---');
            return; // EMBEDDED RETURN
        }
        const pktBuf = new ArrayBuffer(256);
        const pktData = new Uint8Array(pktBuf);
        const pktView = new DataView(pktBuf);
        const slMsgBuf = new Uint8Array(512);
        let i: number;
        let msgIdx: number;

        this.seqNum = ++this.seqNum % 256;
        msgIdx = 0;
        pktView.setUint16(msgIdx, gConst.SL_MSG_READ_ATTR_SET_AT_IDX, gConst.LE);
        msgIdx += 2;
        msgIdx += 2; // len
        msgIdx += 1; // crc
        // cmd data
        pktView.setUint8(msgIdx++, this.seqNum);
        pktView.setUint16(msgIdx, hostCmd.shortAddr, gConst.LE);
        msgIdx += 2;
        pktView.setUint8(msgIdx++, hostCmd.idx);

        const msgLen = msgIdx;
        const dataLen = msgLen - gConst.HEAD_LEN;
        pktView.setUint16(gConst.LEN_IDX, dataLen, gConst.LE);
        let crc = 0;
        for(i = 0; i < msgLen; i++) {
            crc ^= pktData[i];
        }
        pktView.setUint8(gConst.CRC_IDX, crc);

        msgIdx = 0;
        slMsgBuf[msgIdx++] = gConst.SL_START_CHAR;
        for(i = 0; i < msgLen; i++) {
            if(pktData[i] < 0x10) {
                pktData[i] ^= 0x10;
                slMsgBuf[msgIdx++] = gConst.SL_ESC_CHAR;
            }
            slMsgBuf[msgIdx++] = pktData[i];
        }
        slMsgBuf[msgIdx++] = gConst.SL_END_CHAR;

        const slMsgLen = msgIdx;
        const slMsg = slMsgBuf.slice(0, slMsgLen);
        let slHexMsg = '';
        for(i = 0; i < slMsgLen; i++) {
            slHexMsg += ('0' + slMsg[i].toString(16)).slice(-2);
        }
        try {
            await this.serial.writeHex(slHexMsg);
        }
        catch(err) {
            console.log('serial write err: ' + JSON.stringify(err));
        }
    }

    /***********************************************************************************************
     * fn          reqBindAtIdx
     *
     * brief
     *
     */
    private async reqBindAtIdx() {

        const hostCmd = this.hostCmdQueue[0];

        if(hostCmd.shortAddr === undefined) {
            console.log('----- REQ_BINDS_AT_IDX HOST UNDEFINED -----');
            return;
        }
        const pktBuf = new ArrayBuffer(256);
        const pktData = new Uint8Array(pktBuf);
        const pktView = new DataView(pktBuf);
        const slMsgBuf = new Uint8Array(512);
        let i: number;

        this.seqNum = ++this.seqNum % 256;
        let msgIdx = 0;
        pktView.setUint16(msgIdx, gConst.SL_MSG_READ_BIND_AT_IDX, gConst.LE);
        msgIdx += 2;
        msgIdx += 2 + 1; // len + crc
        // cmd data
        pktView.setUint8(msgIdx++, this.seqNum);
        pktView.setUint16(msgIdx, hostCmd.shortAddr, gConst.LE);
        msgIdx += 2;
        pktView.setUint8(msgIdx++, hostCmd.idx);

        const msgLen = msgIdx;
        const dataLen = msgLen - gConst.HEAD_LEN;
        pktView.setUint16(gConst.LEN_IDX, dataLen, gConst.LE);
        let crc = 0;
        for(i = 0; i < msgLen; i++) {
            crc ^= pktData[i];
        }
        pktView.setUint8(gConst.CRC_IDX, crc);

        msgIdx = 0;
        slMsgBuf[msgIdx++] = gConst.SL_START_CHAR;
        for(i = 0; i < msgLen; i++) {
            if(pktData[i] < 0x10) {
                pktData[i] ^= 0x10;
                slMsgBuf[msgIdx++] = gConst.SL_ESC_CHAR;
            }
            slMsgBuf[msgIdx++] = pktData[i];
        }
        slMsgBuf[msgIdx++] = gConst.SL_END_CHAR;

        const slMsgLen = msgIdx;
        const slMsg = slMsgBuf.slice(0, slMsgLen);
        let slHexMsg = '';
        for(i = 0; i < slMsgLen; i++) {
            slHexMsg += ('0' + slMsg[i].toString(16)).slice(-2);
        }
        try {
            await this.serial.writeHex(slHexMsg);
        }
        catch (err) {
            console.log('serial write err: ' + JSON.stringify(err));
        }
    }

    /***********************************************************************************************
     * fn          wrBind
     *
     * brief
     *
     */
    public wrBind(bind: string) {

        const cmd: gIF.hostCmd_t = {
            shortAddr: 0, // not used
            type: gConst.WR_BIND,
            idx: 0, // not used
            retryCnt: gConst.RD_HOST_RETRY_CNT,
            param: bind,
        };
        this.hostCmdQueue.push(cmd);
        if(this.hostCmdFlag === false) {
            this.hostCmdFlag = true;
            this.runHostCmd();
        }
    }

    /***********************************************************************************************
     * fn          wrBindReq
     *
     * brief
     *
     */
    public async wrBindReq() {

        const hostCmd = this.hostCmdQueue[0];
        const bindSrc: gIF.hostedBind_t = JSON.parse(hostCmd.param);

        const pktBuf = new ArrayBuffer(256);
        const pktData = new Uint8Array(pktBuf);
        const pktView = new DataView(pktBuf);
        const slMsgBuf = new Uint8Array(512);
        let msgIdx: number;
        let i: number;

        this.seqNum = ++this.seqNum % 256;
        msgIdx = 0;
        pktView.setUint16(msgIdx, gConst.SL_MSG_WRITE_BIND, gConst.LE);
        msgIdx += 2;
        msgIdx += 2 + 1; // len + crc
        // cmd data
        pktView.setUint8(msgIdx++, this.seqNum);
        pktView.setUint16(msgIdx, bindSrc.hostShortAddr, gConst.LE);
        msgIdx += 2;
        pktView.setFloat64(msgIdx, bindSrc.extAddr, gConst.LE);
        msgIdx += 8;
        pktView.setUint8(msgIdx++, bindSrc.srcEP);
        pktView.setUint16(msgIdx, bindSrc.clusterID, gConst.LE);
        msgIdx += 2;
        pktView.setFloat64(msgIdx, bindSrc.dstExtAddr, gConst.LE);
        msgIdx += 8;
        pktView.setUint8(msgIdx++, bindSrc.dstEP);

        const msgLen = msgIdx;
        const dataLen = msgLen - gConst.HEAD_LEN;
        pktView.setUint16(gConst.LEN_IDX, dataLen, gConst.LE);
        let crc = 0;
        for(i = 0; i < msgLen; i++) {
            crc ^= pktData[i];
        }
        pktView.setUint8(gConst.CRC_IDX, crc);

        msgIdx = 0;
        slMsgBuf[msgIdx++] = gConst.SL_START_CHAR;
        for(i = 0; i < msgLen; i++) {
            if(pktData[i] < 0x10) {
                pktData[i] ^= 0x10;
                slMsgBuf[msgIdx++] = gConst.SL_ESC_CHAR;
            }
            slMsgBuf[msgIdx++] = pktData[i];
        }
        slMsgBuf[msgIdx++] = gConst.SL_END_CHAR;

        const slMsgLen = msgIdx;
        const slMsg = slMsgBuf.slice(0, slMsgLen);
        let slHexMsg = '';
        for(i = 0; i < slMsgLen; i++) {
            slHexMsg += ('0' + slMsg[i].toString(16)).slice(-2);
        }
        try {
            await this.serial.writeHex(slHexMsg);
        }
        catch(err) {
            console.log('serial write err: ' + JSON.stringify(err));
        }
    }

    /***********************************************************************************************
     * fn          udpZclCmd
     *
     * brief
     *
     */
    public udpZclCmd(zclCmd: string) {

        const cmd: gIF.hostCmd_t = {
            shortAddr: 0, // not used
            type: gConst.ZCL_CMD,
            idx: 0, // not used
            retryCnt: 0,
            param: zclCmd,
        };
        this.hostCmdQueue.push(cmd);
        if(this.hostCmdFlag === false) {
            this.hostCmdFlag = true;
            this.runHostCmd();
        }
    }

    /***********************************************************************************************
     * fn          udpZclReq
     *
     * brief
     *
     */
    public async zclReq() {

        const hostCmd = this.hostCmdQueue[0];
        const req: gIF.udpZclReq_t = JSON.parse(hostCmd.param);

        const pktBuf = new ArrayBuffer(256);
        const pktData = new Uint8Array(pktBuf);
        const pktView = new DataView(pktBuf);
        const slMsgBuf = new Uint8Array(512);
        let msgIdx: number;
        let i: number;

        this.seqNum = ++this.seqNum % 256;
        msgIdx = 0;
        pktView.setUint16(msgIdx, gConst.SL_MSG_ZCL_CMD, gConst.LE);
        msgIdx += 2;
        msgIdx += 2; // len
        msgIdx += 1; // crc
        // cmd data
        pktView.setUint8(msgIdx++, this.seqNum);
        pktView.setFloat64(msgIdx, req.extAddr, gConst.LE);
        msgIdx += 8;
        pktView.setUint8(msgIdx++, req.endPoint);
        pktView.setUint16(msgIdx, req.clusterID, gConst.LE);
        msgIdx += 2;
        pktView.setUint8(msgIdx++, req.hasRsp);
        pktView.setUint8(msgIdx++, req.cmdLen);
        for(i = 0; i < req.cmdLen; i++) {
            pktView.setUint8(msgIdx++, req.cmd[i]);
        }
        const msgLen = msgIdx;
        const dataLen = msgLen - gConst.HEAD_LEN;
        pktView.setUint16(gConst.LEN_IDX, dataLen, gConst.LE);
        let crc = 0;
        for(i = 0; i < msgLen; i++) {
            crc ^= pktData[i];
        }
        pktView.setUint8(gConst.CRC_IDX, crc);

        msgIdx = 0;
        slMsgBuf[msgIdx++] = gConst.SL_START_CHAR;
        for(i = 0; i < msgLen; i++) {
            if(pktData[i] < 0x10) {
                pktData[i] ^= 0x10;
                slMsgBuf[msgIdx++] = gConst.SL_ESC_CHAR;
            }
            slMsgBuf[msgIdx++] = pktData[i];
        }
        slMsgBuf[msgIdx++] = gConst.SL_END_CHAR;

        const slMsgLen = msgIdx;
        const slMsg = slMsgBuf.slice(0, slMsgLen);
        let slHexMsg = '';
        for(i = 0; i < slMsgLen; i++) {
            slHexMsg += ('0' + slMsg[i].toString(16)).slice(-2);
        }
        if(req.hasRsp) {
            // ---
        }
        try {
            await this.serial.writeHex(slHexMsg);
        }
        catch (err) {
            console.log('serial write err: ' + JSON.stringify(err));
        }
    }
}
