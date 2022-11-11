import { Injectable } from '@angular/core';
import { SerialLinkService } from './serial-link.service';
import { EventsService } from './events.service';
import { StorageService } from './storage.service';
import { Platform } from '@ionic/angular';

import * as gConst from '../gConst';
import * as gIF from '../gIF';

import { UDP } from '@frontall/capacitor-udp';
import { decode, encode } from 'base64-arraybuffer';

const LOC_PORT = 22802;

@Injectable({
    providedIn: 'root',
})
export class UdpService {

    udpSocket: number;
    msgBuf = new ArrayBuffer(1024);
    msg = new DataView(this.msgBuf);

    constructor(private serial: SerialLinkService,
                private events: EventsService,
                private storage: StorageService,
                private platform: Platform) {
        this.platform.ready().then(() => {
            this.initSocket();
        });
    }

    /***********************************************************************************************
     * fn          initSocket
     *
     * brief
     *
     */
    async initSocket() {

        this.udpSocket = -1;

        try {
            //await UDP.closeAllSockets();
            const info = await UDP.create();
            this.udpSocket = info.socketId;
            await UDP.bind({
                socketId: info.socketId,
                address: '0.0.0.0',
                port: LOC_PORT
            });
            await UDP.setBroadcast({
                socketId: info.socketId,
                enabled: true
            });
            await UDP.setPaused({
                socketId: info.socketId,
                paused: false
            });
            UDP.addListener('receive', (msg)=>{
                if(msg.socketId === this.udpSocket) {
                    this.udpOnMsg(msg);
                }
            });
        }
        catch(err) {
            console.log(err);
        }
    }

    /***********************************************************************************************
     * fn          closeSocket
     *
     * brief
     *
     */
    public closeSocket() {
        try {
            UDP.close({
                socketId: this.udpSocket
            });
        }
        catch(err) {
            console.log(err);
        }
    }

    /***********************************************************************************************
     * fn          udpOnMsg
     *
     * brief
     *
     */
    public udpOnMsg(msg) {
        const cmdView = new DataView(decode(msg.buffer));
        let msgIdx = 0;
        let cmdIdx = 0;
        const pktFunc = cmdView.getUint16(cmdIdx, gConst.LE);
        cmdIdx += 2;
        switch (pktFunc) {
            case gConst.BRIDGE_ID_REQ: {
                const rnd = Math.floor(Math.random() * 100) + 50;
                setTimeout(()=>{
                    this.msg.setUint16(0, gConst.BRIDGE_ID_RSP, gConst.LE);
                    try {
                        UDP.send({
                            socketId: this.udpSocket,
                            address: msg.remoteAddress,
                            port: msg.remotePort,
                            buffer: encode(this.msgBuf.slice(0, 2)),
                        });
                    }
                    catch(err) {
                        console.log(err);
                    }
                }, rnd);
                break;
            }
            case gConst.ON_OFF_ACTUATORS: {
                this.msg.setUint16(msgIdx, pktFunc, gConst.LE);
                msgIdx += 2;
                const startIdx = cmdView.getUint16(cmdIdx, gConst.LE);
                cmdIdx += 2;
                this.msg.setUint16(msgIdx, startIdx, gConst.LE);
                msgIdx += 2;
                const numIdx = msgIdx;
                let numVals = 0;
                this.msg.setUint16(msgIdx, numVals, gConst.LE);
                msgIdx += 2;
                const doneIdx = msgIdx;
                this.msg.setUint8(msgIdx, 1);
                msgIdx++;
                let valIdx = 0;
                for(const attrSet of this.serial.setMap.values()) {
                    if(attrSet.clusterID === gConst.CLUSTER_ID_GEN_ON_OFF) {
                        if(valIdx >= startIdx) {
                            numVals++;
                            this.msg.setUint32(msgIdx, attrSet.partNum, gConst.LE);
                            msgIdx += 4;
                            this.msg.setFloat64(msgIdx, attrSet.extAddr, gConst.LE);
                            msgIdx += 8;
                            this.msg.setUint8(msgIdx, attrSet.endPoint);
                            msgIdx++;
                            this.msg.setUint8(msgIdx, attrSet.setVals.state);
                            msgIdx++;
                            this.msg.setUint8(msgIdx, attrSet.setVals.level);
                            msgIdx++;
                            this.msg.setUint8(msgIdx, attrSet.setVals.name.length);
                            msgIdx++;
                            for(let i = 0; i < attrSet.setVals.name.length; i++) {
                                this.msg.setUint8(msgIdx, attrSet.setVals.name.charCodeAt(i));
                                msgIdx++;
                            }
                        }
                        valIdx++;
                    }
                    if(msgIdx > 500) {
                        this.msg.setUint8(doneIdx, 0);
                        break; // exit for-loop
                    }
                }
                if(numVals) {
                    this.msg.setUint16(numIdx, numVals, gConst.LE);
                }
                try {
                    UDP.send({
                        socketId: this.udpSocket,
                        address: msg.remoteAddress,
                        port: msg.remotePort,
                        buffer: encode(this.msgBuf.slice(0, msgIdx)),
                    });
                }
                catch(err) {
                    console.log(err);
                }
                break;
            }
            case gConst.T_SENSORS: {
                this.msg.setUint16(msgIdx, pktFunc, gConst.LE);
                msgIdx += 2;
                const startIdx = cmdView.getUint16(cmdIdx, gConst.LE);
                cmdIdx += 2;
                this.msg.setUint16(msgIdx, startIdx, gConst.LE);
                msgIdx += 2;
                const numIdx = msgIdx;
                let numVals = 0;
                this.msg.setUint16(msgIdx, numVals, gConst.LE);
                msgIdx += 2;
                const doneIdx = msgIdx;
                this.msg.setUint8(msgIdx, 1);
                msgIdx++;
                let valIdx = 0;
                for(const attrSet of this.serial.setMap.values()) {
                    if(attrSet.clusterID === gConst.CLUSTER_ID_MS_TEMPERATURE_MEASUREMENT) {
                        if(valIdx >= startIdx) {
                            numVals++;
                            this.msg.setUint32(msgIdx, attrSet.partNum, gConst.LE);
                            msgIdx += 4;
                            this.msg.setFloat64(msgIdx, attrSet.extAddr, gConst.LE);
                            msgIdx += 8;
                            this.msg.setUint8(msgIdx, attrSet.endPoint);
                            msgIdx++;
                            this.msg.setInt16(msgIdx, 10 * attrSet.setVals.t_val, gConst.LE);
                            msgIdx += 2;
                            this.msg.setUint16(msgIdx, attrSet.setVals.units, gConst.LE);
                            msgIdx += 2;
                            this.msg.setUint8(msgIdx, attrSet.setVals.name.length);
                            msgIdx++;
                            for(let i = 0; i < attrSet.setVals.name.length; i++) {
                                this.msg.setUint8(msgIdx, attrSet.setVals.name.charCodeAt(i));
                                msgIdx++;
                            }
                        }
                        valIdx++;
                    }
                    if(msgIdx > 500) {
                        this.msg.setUint8(doneIdx, 0);
                        break; // exit for-loop
                    }
                }
                if(numVals) {
                    this.msg.setUint16(numIdx, numVals, gConst.LE);
                }
                try {
                    UDP.send({
                        socketId: this.udpSocket,
                        address: msg.remoteAddress,
                        port: msg.remotePort,
                        buffer: encode(this.msgBuf.slice(0, msgIdx)),
                    });
                }
                catch(err) {
                    console.log(err);
                }
                break;
            }
            case gConst.RH_SENSORS: {
                this.msg.setUint16(msgIdx, pktFunc, gConst.LE);
                msgIdx += 2;
                const startIdx = cmdView.getUint16(cmdIdx, gConst.LE);
                cmdIdx += 2;
                this.msg.setUint16(msgIdx, startIdx, gConst.LE);
                msgIdx += 2;
                const numIdx = msgIdx;
                let numVals = 0;
                this.msg.setUint16(msgIdx, numVals, gConst.LE);
                msgIdx += 2;
                const doneIdx = msgIdx;
                this.msg.setUint8(msgIdx, 1);
                msgIdx++;
                let valIdx = 0;
                for(const attrSet of this.serial.setMap.values()) {
                    if(attrSet.clusterID === gConst.CLUSTER_ID_MS_RH_MEASUREMENT) {
                        if(valIdx >= startIdx) {
                            numVals++;
                            this.msg.setUint32(msgIdx, attrSet.partNum, gConst.LE);
                            msgIdx += 4;
                            this.msg.setFloat64(msgIdx, attrSet.extAddr, gConst.LE);
                            msgIdx += 8;
                            this.msg.setUint8(msgIdx, attrSet.endPoint);
                            msgIdx++;
                            this.msg.setUint16(msgIdx, 10 * attrSet.setVals.rh_val, gConst.LE);
                            msgIdx += 2;
                            this.msg.setUint8(msgIdx, attrSet.setVals.name.length);
                            msgIdx++;
                            for(let i = 0; i < attrSet.setVals.name.length; i++) {
                                this.msg.setUint8(msgIdx, attrSet.setVals.name.charCodeAt(i));
                                msgIdx++;
                            }
                        }
                        valIdx++;
                    }
                    if(msgIdx > 500) {
                        this.msg.setUint8(doneIdx, 0);
                        break; // exit for-loop
                    }
                }
                if(numVals) {
                    this.msg.setUint16(numIdx, numVals, gConst.LE);
                }
                try {
                    UDP.send({
                        socketId: this.udpSocket,
                        address: msg.remoteAddress,
                        port: msg.remotePort,
                        buffer: encode(this.msgBuf.slice(0, msgIdx)),
                    });
                }
                catch(err) {
                    console.log(err);
                }
                break;
            }
            case gConst.UDP_ZCL_CMD: {
                const udpZclCmd = {} as gIF.udpZclReq_t;
                udpZclCmd.ip = msg.remoteAddress;
                udpZclCmd.port = msg.remotePort;
                udpZclCmd.extAddr = cmdView.getFloat64(cmdIdx, gConst.LE);
                cmdIdx += 8;
                udpZclCmd.endPoint = cmdView.getUint8(cmdIdx++);
                udpZclCmd.clusterID = cmdView.getUint16(cmdIdx, gConst.LE);
                cmdIdx += 2;
                udpZclCmd.hasRsp = cmdView.getUint8(cmdIdx++);
                udpZclCmd.cmdLen = cmdView.getUint8(cmdIdx++);
                udpZclCmd.cmd = [];
                for(let i = 0; i < udpZclCmd.cmdLen; i++) {
                    udpZclCmd.cmd[i] = cmdView.getUint8(cmdIdx++);
                }
                this.serial.udpZclCmd(JSON.stringify(udpZclCmd));
                break;
            }
            default:
                // ---
                break;
        }
    }

    /***********************************************************************************************
     * fn          bufferToString
     *
     * brief
     *
     *
    private bufferToString(buffer: ArrayBuffer): string {
        const chrCodes = new Uint8Array(buffer);
        return btoa(String.fromCharCode.apply(null, chrCodes));
    }
    */
    /***********************************************************************************************
     * fn          stringToBuffer
     *
     * brief
     *
     *
    private stringToBuffer(base64String: string): ArrayBuffer {
        const str = atob(base64String);
        let buf = new ArrayBuffer(str.length);
        let bufView = new Uint8Array(buf);
        for(let i = 0, strLen = str.length; i < strLen; i++) {
            bufView[i] = str.charCodeAt(i);
        }
        return buf;
    }
    */
}
