import { Injectable } from '@angular/core';
import { EventsService } from './events.service';
import { StorageService } from './storage.service';
import { Platform } from '@ionic/angular';
import { HTTP } from '@ionic-native/http/ngx';

//import * as gConst from '../gConst';
import * as gIF from '../gIF';

//const HTTP_PORT = 18870;

@Injectable({
    providedIn: 'root',
})
export class HttpService {
    firsrRun = true;
    ipAddr = '';

    constructor(private http: HTTP,
                private events: EventsService,
                private storage: StorageService,
                private platform: Platform) {
        this.platform.ready().then(() => {
            setTimeout(() => {
                this.initHttp();
            }, 5000);
        });
    }

    /***********************************************************************************************
     * fn          initHttp
     *
     * brief
     *
     */
    public initHttp() {
        this.storage.getPublicIP().then((ip) => {
            this.ipAddr = ip;
            this.getIP();
        }).catch((err) => {
            console.log(err);
            this.ipAddr = '0.0.0.0';
            this.getIP();
        });
    }

    /***********************************************************************************************
     * fn          getIP
     *
     * brief
     *
     */
    public getIP() {
        this.http.get('https://jsonip.com', {}, {}).then((rsp: any)=>{
            const data = JSON.parse(rsp.data);
            console.log(data);
            if(this.ipAddr !== data.ip) {
                this.storage.getFreeDNS().then((dns: gIF.dns_t)=>{
                    if(dns) {
                        const authHeader = this.http.getBasicAuthHeader(dns.user, dns.psw);
                        const httpReq = `https://freedns.afraid.org/nic/update?hostname=${dns.domain}`;
                        this.http.get(httpReq, {}, authHeader).then((httpRsp) => {
                            console.log(httpRsp.data);
                            console.log(`ip: ${data.ip}`);
                            this.ipAddr = data.ip;
                            this.storage.setPublicIP(data.ip);
                        });
                    }
                }).catch((err)=>{
                    console.log(`get freeDNS err: ${err.code}`);
                });
            }
        });
        setTimeout(()=>{
            this.getIP();
        }, 60000);
    }
}
