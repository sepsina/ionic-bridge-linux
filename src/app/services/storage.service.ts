import { Injectable } from '@angular/core';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { Platform } from '@ionic/angular';

import * as gConst from '../gConst';
import * as gIF from '../gIF';

@Injectable({
    providedIn: 'root',
})
export class StorageService {
    attrMap = new Map();
    bindsMap = new Map();

    nvAttrMap = new Map();
    nvBindsMap = new Map();

    nvThermostatsMap = new Map();

    constructor(private nativeStorage: NativeStorage,
                private platform: Platform) {
        this.platform.ready().then(() => {
            setTimeout(() => {
                this.init();
            }, 100);
        });
    }

    init() {
        this.nativeStorage.clear(); // *** TEST ***
        // ---
    }

    /***********************************************************************************************
     * fn          readAllKeys
     *
     * brief
     *
     */
    async readAllKeys() {
        const keys = await this.nativeStorage.keys();
        if(keys) {
            for(const key of keys) {
                const val = await this.nativeStorage.getItem(key);
                if(val) {
                    if(key.slice(0, 4) === 'attr') {
                        this.nvAttrMap.set(key, val);
                    }
                    if(key.slice(0, 4) === 'bind') {
                        this.nvBindsMap.set(key, val);
                    }
                    if(key.slice(0, 10) === 'thermostat') {
                        this.nvThermostatsMap.set(key, val);
                    }
                }
            }
        }
    }

    /***********************************************************************************************
     * fn          setAttrNameAndStyle
     *
     * brief
     *
     */
    async setAttrNameAndStyle(name: string,
                              style: gIF.ngStyle_t,
                              valCorr: gIF.valCorr_t,
                              keyVal: any){

        const attr: gIF.hostedAttr_t = keyVal.value;

        attr.name = name;
        attr.style = style;
        attr.valCorr = valCorr;

        const storedAttr = {} as gIF.storedAttr_t;
        storedAttr.attrName = name;
        storedAttr.pos = attr.pos;
        storedAttr.style = style;
        storedAttr.valCorr = valCorr;

        this.nvAttrMap.set(keyVal.key, storedAttr);
        await this.nativeStorage.setItem(keyVal.key, storedAttr);
    }

    /***********************************************************************************************
     * fn          setAttrPos
     *
     * brief
     *
     */
    async setAttrPos(pos: gIF.nsPos_t, keyVal: any) {

        const attr: gIF.hostedAttr_t = keyVal.value;

        attr.pos = pos;

        const storedAttr = {} as gIF.storedAttr_t;
        storedAttr.attrName = attr.name;
        storedAttr.pos = pos;
        storedAttr.style = attr.style;
        storedAttr.valCorr = attr.valCorr;

        this.nvAttrMap.set(keyVal.key, storedAttr);
        await this.nativeStorage.setItem(keyVal.key, storedAttr);
    }

    /***********************************************************************************************
     * fn          delStoredAttr
     *
     * brief
     *
     */
    async delStoredAttr(attr: gIF.hostedAttr_t) {

        const key = this.attrKey(attr);

        this.attrMap.delete(key);
        this.nvAttrMap.delete(key);

        await this.nativeStorage.remove(key);
    }

    /***********************************************************************************************
     * fn          attrKey
     *
     * brief
     *
     */
    attrKey(params: any) {

        const len = 8 + 1 + 2 + 2 + 2;
        let i = 0;
        const ab = new ArrayBuffer(len);
        const dv = new DataView(ab);
        dv.setFloat64(i, params.extAddr, gConst.LE);
        i += 8;
        dv.setUint8(i++, params.endPoint);
        dv.setUint16(i, params.clusterID, gConst.LE);
        i += 2;
        dv.setUint16(i, params.attrSetID, gConst.LE);
        i += 2;
        dv.setUint16(i, params.attrID, gConst.LE);
        i += 2;
        const key = [];
        for (let j = 0; j < len; j++) {
            key[j] = dv.getUint8(j).toString(16);
        }
        return `attr-${key.join('')}`;
    }

    /***********************************************************************************************
     * fn          setBindName
     *
     * brief
     *
     */
    async setBindName(bind: gIF.hostedBind_t) {
        const key = this.bindKey(bind);
        const val: gIF.hostedBind_t = this.bindsMap.get(key);
        if(val) {
            val.name = bind.name;
            const storedBind = {} as gIF.storedBind_t;
            storedBind.bindName = bind.name;
            this.nvBindsMap.set(key, storedBind);
            await this.nativeStorage.setItem(key, storedBind);
        }
    }

    /***********************************************************************************************
     * fn          delStoredBinds
     *
     * brief
     *
     */
    async delStoredBinds(binds: gIF.hostedBind_t) {
        const key = this.bindKey(binds);
        this.bindsMap.delete(key);
        this.nvBindsMap.delete(key);
        await this.nativeStorage.remove(key);
    }

    /***********************************************************************************************
     * fn          bindsKey
     *
     * brief
     *
     */
    bindKey(bind: gIF.hostedBind_t) {

        const len = 8 + 1 + 2;
        let i = 0;
        const ab = new ArrayBuffer(len);
        const dv = new DataView(ab);
        dv.setFloat64(i, bind.extAddr, gConst.LE);
        i += 8;
        dv.setUint8(i++, bind.srcEP);
        dv.setUint16(i, bind.clusterID, gConst.LE);
        i += 2;
        const key = [];
        for (let j = 0; j < len; j++) {
            key[j] = dv.getUint8(j).toString(16);
        }
        return `bind-${key.join('')}`;
    }

    /***********************************************************************************************
     * fn          setScrolls
     *
     * brief
     *
     */
    async setScrolls(scrolls: gIF.scroll_t[]) {
        await this.nativeStorage.setItem('scrolls', JSON.stringify(scrolls));
    }
    /***********************************************************************************************
     * fn          getScrolls
     *
     * brief
     *
     */
    async getScrolls() {
        return (await this.nativeStorage.getItem('scrolls'));
    }

    /***********************************************************************************************
     * fn          setPublicIP
     *
     * brief
     *
     */
    async setPublicIP(ip: string) {
        await this.nativeStorage.setItem('public-ip', ip);
    }
    /***********************************************************************************************
     * fn          getPublicIP
     *
     * brief
     *
     */
    async getPublicIP(): Promise<string> {
        return (await this.nativeStorage.getItem('public-ip'));
    }

    /***********************************************************************************************
     * fn          setFreeDNS
     *
     * brief
     *
     */
    async setFreeDNS(dns: gIF.dns_t) {
        await this.nativeStorage.setItem('free-dns', dns);
    }
    /***********************************************************************************************
     * fn          getFreeDNS
     *
     * brief
     *
     */
    async getFreeDNS() {
        return (await this.nativeStorage.getItem('free-dns'));
    }

    /***********************************************************************************************
     * fn          thermostatKey
     *
     * brief
     *
     */
    thermostatKey(extAddr: number, endPoint: number) {

        const len = 8 + 1;
        let i = 0;
        const ab = new ArrayBuffer(len);
        const dv = new DataView(ab);
        dv.setFloat64(i, extAddr, gConst.LE);
        i += 8;
        dv.setUint8(i++, endPoint);
        const key = [];
        for (let j = 0; j < len; j++) {
            key[j] = dv.getUint8(j).toString(16);
        }
        return `thermostat-${key.join('')}`;
    }

    /***********************************************************************************************
     * fn          delThermostat
     *
     * brief
     *
     */
    async delThermostat(thermostat: gIF.thermostat_t) {
        const key = this.thermostatKey(thermostat.extAddr, thermostat.endPoint);
        await this.nativeStorage.remove(key);
    }

    /***********************************************************************************************
     * fn          delAllThermostat
     *
     * brief
     *
     */
    async delAllThermostat() {
        for(const key of this.nvThermostatsMap.keys()){
            await this.nativeStorage.remove(key);
        }
        this.nvThermostatsMap.clear();
    }

    /***********************************************************************************************
     * fn          storeThermostat
     *
     * brief
     *
     */
    async storeThermostat(thermostat: gIF.thermostat_t) {
        const key = this.thermostatKey(thermostat.extAddr, thermostat.endPoint);
        await this.nativeStorage.setItem(key, thermostat);
        this.nvThermostatsMap.set(key, thermostat);
    }

}
