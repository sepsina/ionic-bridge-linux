/* eslint-disable object-shorthand */
/* eslint-disable @angular-eslint/component-class-suffix */
/* eslint-disable @angular-eslint/component-selector */
/* eslint-disable @typescript-eslint/naming-convention */
import { Component, Inject, OnInit, AfterViewInit } from '@angular/core';
import { SerialLinkService } from '../services/serial-link.service';
import { StorageService } from '../services/storage.service';
import { EventsService } from '../services/events.service';
import { Validators, FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { HTTP } from '@ionic-native/http/ngx';

import * as gConst from '../gConst';
import * as gIF from '../gIF';

interface httpRsp_t {
    key: string;
    value: string;
}

@Component({
    selector: 'app-edit-freeDNS',
    templateUrl: './edit-freeDNS.html',
    styleUrls: ['./edit-freeDNS.css'],
})
export class EditFreeDNS implements OnInit, AfterViewInit {

    dns = {} as gIF.dns_t;
    httpRsp = '';

    logs: httpRsp_t[] = [];

    userFormCtrl = new FormControl('', Validators.required);
    pswFormCtrl = new FormControl('', Validators.required);
    domainFormCtrl = new FormControl('', Validators.required);
    tokenFormCtrl = new FormControl('', Validators.required);

    constructor(public dialogRef: MatDialogRef<EditFreeDNS>,
                @Inject(MAT_DIALOG_DATA) public dlgData: any,
                public serialLink: SerialLinkService,
                public events: EventsService,
                public storage: StorageService,
                public http: HTTP) {
        // ---
    }

    /***********************************************************************************************
     * fn          ngOnInit
     *
     * brief
     *
     */
    ngOnInit(): void {

        this.dns.user = 'user';
        this.dns.psw = 'psw';
        this.dns.domain = 'domain';
        this.dns.token = 'token';

        const log = {
            key: '- status :',
            value: '...',
        };
        this.logs = [];
        this.logs.push(log);
    }
    /***********************************************************************************************
     * fn          ngAfterViewInit
     *
     * brief
     *
     */
    async ngAfterViewInit() {

        try {
            const freeDns = await this.storage.getFreeDNS();
            if(freeDns) {
                this.dns = freeDns;
                this.userFormCtrl.setValue(this.dns.user);
                this.pswFormCtrl.setValue(this.dns.psw);
                this.domainFormCtrl.setValue(this.dns.domain);
            }
        }
        catch(err) {
            console.log(`get freeDNS err: ${err}`);
        }
    }
    /***********************************************************************************************
     * fn          save
     *
     * brief
     *
     */
    async save() {

        this.dns.user = this.userFormCtrl.value;
        this.dns.psw = this.pswFormCtrl.value;
        this.dns.domain = this.domainFormCtrl.value;
        this.dns.token = 'not-used';
        try {
            await this.storage.setFreeDNS(this.dns);
        }
        catch(err) {
            console.log(err);
        }
        this.dialogRef.close();
    }
    /***********************************************************************************************
     * fn          close
     *
     * brief
     *
     */
    close() {
        this.dialogRef.close();
    }
    /***********************************************************************************************
     * fn          userErr
     *
     * brief
     *
     */
    userErr() {
        if(this.userFormCtrl.hasError('required')) {
            return 'You must enter a value';
        }
    }
    /***********************************************************************************************
     * fn          pswErr
     *
     * brief
     *
     */
    pswErr() {
        if(this.pswFormCtrl.hasError('required')) {
            return 'You must enter a value';
        }
    }
    /***********************************************************************************************
     * fn          domainErr
     *
     * brief
     *
     */
    domainErr() {
        if(this.domainFormCtrl.hasError('required')) {
            return 'You must enter a value';
        }
    }

    /***********************************************************************************************
     * fn          test
     *
     * brief
     *
     */
    test() {

        let log = {
            key: '- status :',
            value: '...',
        };
        this.logs = [];
        this.logs.push(log);
        const header = this.http.getBasicAuthHeader(this.dns.user, this.dns.psw);
        const freeDNS = `https://freedns.afraid.org/nic/update?hostname=${this.dns.domain}`;
        this.http.get(freeDNS, {}, header).then((rsp)=>{
            this.logs = [];
            log = {
                key: '- status: ',
                value: rsp.status.toString(),
            };
            this.logs.push(log);
            log = {
                key: '- url: ',
                value: rsp.url,
            };
            this.logs.push(log);
            for (const [key, value] of Object.entries(rsp.headers)) {
                log = {
                    key: `- ${key}: `,
                    value: value,
                };
                this.logs.push(log);
            }
            if (rsp.error) {
                log = {
                    key: '- error: ',
                    value: rsp.error,
                };
                this.logs.push(log);
            }
            log = {
                key: '- data: ',
                value: rsp.data,
            };
            this.logs.push(log);
        });
    }
}
