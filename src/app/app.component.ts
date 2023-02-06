/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable object-shorthand */
import { AfterViewInit, Component, ElementRef, OnInit, ViewChild, NgZone, Renderer2 } from '@angular/core';
import { EventsService } from './services/events.service';
import { SerialLinkService } from './services/serial-link.service';
import { UdpService } from './services/udp.service';
import { HttpService } from './services/http.service';
import { StorageService } from './services/storage.service';
import { UtilsService} from './services/utils.service';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { File } from '@ionic-native/file/ngx';
import { MatTooltip } from '@angular/material/tooltip';
import { Platform } from '@ionic/angular';

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

import { SetStyles } from './set-styles/set-styles.page';
import { EditScrolls } from './edit-scrolls/edit-scrolls';
import { EditFreeDNS } from './edit-freeDNS/edit-freeDNS';
import { EditBinds } from './binds/binds.page';
import { EditStats } from './x-stat/x_stat.page';

import * as gConst from './gConst';
import * as gIF from './gIF';

//import { LoadingController } from '@ionic/angular';
import { CdkDragEnd, CdkDragStart } from '@angular/cdk/drag-drop';
import { ShowLogs } from './logs/show-logs';

const DUMMY_SCROLL = '- scroll -';
const dumyScroll: gIF.scroll_t = {
    name: DUMMY_SCROLL,
    yPos: 0
};

const wait_msg = '--------';

@Component({
    selector: 'app-root',
    templateUrl: 'app.component.html',
    styleUrls: ['app.component.scss'],
})
export class AppComponent implements OnInit, AfterViewInit {

    @ViewChild('containerRef') containerRef: ElementRef;
    @ViewChild('floorPlanRef') floorPlanRef: ElementRef;

    bkgImgWidth: number;
    bkgImgHeight: number;

    imgDim = {} as gIF.imgDim_t;

    scrolls: gIF.scroll_t[] = [
        dumyScroll,
        {
            name: 'floor-1',
            yPos: 10
        },
        {
            name: 'floor-2',
            yPos: 40
        },
    ];
    selScroll = this.scrolls[0];

    partDesc: gIF.partDesc_t[] = [];
    partMap = new Map();

    loading: any;
    dragFlag = false;

    progressFlag = false;
    waitMsg = 'wait';
    msgIdx = 0;

    msgLogs: gIF.msgLogs_t[] = [];

    constructor(private events: EventsService,
                private serialLink: SerialLinkService,
                private udp: UdpService,
                public storage: StorageService,
                private matDialog: MatDialog,
                private file: File,
                private ngZone: NgZone,
                private platform: Platform,
                private utils: UtilsService,
                private renderer: Renderer2) {
        this.platform.ready().then(()=>{
            setTimeout(()=>{
                this.init();
            }, 100);
        });
    }

    /***********************************************************************************************
     * fn          ngAfterViewInit
     *
     * brief
     *
     */
    ngAfterViewInit() {
        // ---
    }

    /***********************************************************************************************
     * fn          ngOnInit
     *
     * brief
     *
     */
    async ngOnInit() {
        window.onbeforeunload = ()=>{
            this.udp.closeSocket();
        };

        this.events.subscribe('temp_event', (event: gIF.tempEvent_t)=>{
            this.tempEvent(event);
        });

        this.events.subscribe('logMsg', (msg: gIF.msgLogs_t)=>{
            while(this.msgLogs.length >= 20) {
                this.msgLogs.shift();
            }
            this.msgLogs.push(msg);
        });
    }

    /***********************************************************************************************
     * fn          init
     *
     * brief
     *
     */
    async init() {

        try {
            const r_dir = await Filesystem.readdir({
                directory: Directory.External,
                path: ''
            });
            console.log(r_dir);
        }
        catch(err) {
            console.log(err);
        }

        try {
            const base64 = await Filesystem.readFile({
                //directory: Directory.ExternalStorage,
                directory: Directory.External,
                //path: 'Download/floor_plan.jpg',
                path: 'floor_plan.jpg',
            });
            const imgUrl = `data:image/jpeg;base64,${base64.data}`;
            this.setBkgImg(imgUrl);
        }
        catch (err) {
            console.log('read img err: ' + err.code);
            this.setBkgImg(gConst.DFLT_BKG_IMG);
        }

        try {
            const parts = await Filesystem.readFile({
                //directory: Directory.ExternalStorage,
                directory: Directory.External,
                //path: 'Download/parts.json',
                path: 'parts.json',
                encoding: Encoding.UTF8,
            });
            this.partDesc = JSON.parse(parts.data);
            for(const desc of this.partDesc) {
                const part = {} as gIF.part_t;
                part.devName = desc.devName;
                part.part = desc.part;
                part.url = desc.url;
                this.partMap.set(desc.partNum, part);
            }
            console.log(JSON.stringify(this.partDesc));
        }
        catch(err) {
            console.log('loadParts: read parts err: ' + err.code);
        }

        //this.scrolls = [];
        this.storage.getScrolls().then(
            (scrolls)=>{
                this.scrolls = JSON.parse(scrolls);
            },
            (err)=>{
                console.log('get scrolls err: ' + err.code);
            }
        );
        /*
        this.loading = await this.loadingController.create({
            message: '... wait',
            duration: 10000,
            mode: 'md',
        });
        */
    }

    /***********************************************************************************************
     * fn          getAttrStyle
     *
     * brief
     *
     */
    getAttrStyle(attr: any) {

        const attrStyle = attr.value.style;
        const retStyle = {
            color: attrStyle.color,
            'background-color': attrStyle.bgColor,
            'font-size.px': attrStyle.fontSize,
            'border-color': attrStyle.borderColor,
            'border-width.px': attrStyle.borderWidth,
            'border-style': attrStyle.borderStyle,
            'border-radius.px': attrStyle.borderRadius,
            'padding-top.px': attrStyle.paddingTop,
            'padding-right.px': attrStyle.paddingRight,
            'padding-bottom.px': attrStyle.paddingBottom,
            'padding-left.px': attrStyle.paddingLeft,
        };
        if(attr.value.isValid === false) {
            retStyle.color = 'gray';
            retStyle['background-color'] = 'transparent';
            retStyle['border-color'] = 'gray';
            retStyle['border-width.px'] = 2;
            retStyle['border-style'] = 'dotted';
        }
        return retStyle;
    }

    /***********************************************************************************************
     * fn          setBkgImg
     *
     * brief
     *
     */
    setBkgImg(imgSrc: string) {

        const bkgImg = new Image();
        bkgImg.src = imgSrc;
        bkgImg.onload = ()=>{
            this.bkgImgWidth = bkgImg.width;
            this.bkgImgHeight = bkgImg.height;
            const el = this.containerRef.nativeElement;
            const divDim = el.getBoundingClientRect();
            this.imgDim.width = divDim.width;
            this.imgDim.height = Math.round((divDim.width / bkgImg.width) * bkgImg.height);
            this.renderer.setStyle(el, 'height', `${this.imgDim.height}px`);
            this.renderer.setStyle(el, 'backgroundImage', `url(${imgSrc})`);
            this.renderer.setStyle(el, 'backgroundAttachment', 'scroll');
            this.renderer.setStyle(el, 'backgroundRepeat', 'no-repeat');
            this.renderer.setStyle(el, 'backgroundSize', 'contain');
        };
    }

    /***********************************************************************************************
     * fn          getAttrPosition
     *
     * brief
     *
     */
    getAttrPosition(keyVal: any) {

        const attr: gIF.hostedAttr_t = keyVal.value;

        if(attr.drag){
            return undefined;
        }
        const attrPos = attr.pos;

        return {
            x: attrPos.x * this.imgDim.width,
            y: attrPos.y * this.imgDim.height,
        };
    }

    /***********************************************************************************************
     * fn          onDragEnded
     *
     * brief
     *
     */
     async onDragEnded(event: CdkDragEnd, keyVal: any) {

        this.dragFlag = false;
        event.source.element.nativeElement.style.zIndex = '1';

        const evtPos = event.source.getFreeDragPosition();

        const pos: gIF.nsPos_t = {
            x: evtPos.x / this.imgDim.width,
            y: evtPos.y / this.imgDim.height,
        };

        await this.storage.setAttrPos(pos, keyVal);
    }

    /***********************************************************************************************
     * @fn          onDragStarted
     *
     * @brief
     *
     */
     async onDragStarted(event: CdkDragStart) {
        this.dragFlag = true;
        event.source.element.nativeElement.style.zIndex = '10000';
    }

    /***********************************************************************************************
     * fn          setStyles
     *
     * brief
     *
     */
    async setStyles(keyVal: any) {

        this.startWait();
        setTimeout(()=>{
            const dialogConfig = new MatDialogConfig();
            dialogConfig.data = keyVal;
            dialogConfig.width = '350px';
            dialogConfig.autoFocus = false;
            dialogConfig.disableClose = true;
            dialogConfig.panelClass = 'set-styles-container';
            dialogConfig.restoreFocus = false;

            const dlgRef = this.matDialog.open(SetStyles, dialogConfig);
            dlgRef.afterOpened().subscribe(()=>{
                this.progressFlag = false;
                //this.dismissLoading();
            });
        }, 10);

        //await this.loading.present();
    }

    /***********************************************************************************************
     * fn          onEditScrollsClick
     *
     * brief
     *
     */
    async onEditScrollsClick() {

        this.startWait();
        setTimeout(()=>{
            const dlgData = {
                scrolls: JSON.parse(JSON.stringify(this.scrolls)),
                scrollRef: this.floorPlanRef.nativeElement,
                imgDim: this.imgDim,
            };
            const dialogConfig = new MatDialogConfig();
            dialogConfig.data = dlgData;
            dialogConfig.width = '300px';
            dialogConfig.autoFocus = false;
            dialogConfig.disableClose = true;
            dialogConfig.panelClass = 'edit-scrolls-container';
            dialogConfig.restoreFocus = false;

            const dlgRef = this.matDialog.open(EditScrolls, dialogConfig);

            dlgRef.afterOpened().subscribe(()=>{
                this.progressFlag = false;
                //this.dismissLoading();
            });
            dlgRef.afterClosed().subscribe((data)=>{
                if(data) {
                    this.scrolls = data;
                    this.scrolls.unshift(dumyScroll);
                    this.storage.setScrolls(this.scrolls);
                }
            });
        }, 10);

        //await this.loading.present();
    }

    /***********************************************************************************************
     * fn          setDNS
     *
     * brief
     *
     */
    async setDNS() {

        this.startWait();
        setTimeout(()=>{
            const dialogConfig = new MatDialogConfig();
            dialogConfig.data = '';
            dialogConfig.width = '350px';
            dialogConfig.autoFocus = false;
            dialogConfig.disableClose = true;
            dialogConfig.panelClass = 'set-dns-container';
            dialogConfig.restoreFocus = false;

            const dlgRef = this.matDialog.open(EditFreeDNS, dialogConfig);
            dlgRef.afterOpened().subscribe(()=>{
                this.progressFlag = false;
                //this.dismissLoading();
            });
        }, 10);

        //await this.loading.present();
    }

    /***********************************************************************************************
     * fn          editBinds
     *
     * brief
     *
     */
    async editBinds() {

        this.startWait();
        setTimeout(()=>{
            const dlgData = {
                partMap: this.partMap,
            };
            const dialogConfig = new MatDialogConfig();
            dialogConfig.data = dlgData;
            dialogConfig.autoFocus = false;
            dialogConfig.disableClose = true;
            dialogConfig.panelClass = 'edit-binds-container';
            dialogConfig.restoreFocus = false;

            const dlgRef = this.matDialog.open(EditBinds, dialogConfig);

            dlgRef.afterOpened().subscribe(()=>{
                this.progressFlag = false;
                //this.dismissLoading();
            });
        }, 10);

        //await this.loading.present();
    }

    /***********************************************************************************************
     * @fn          editThermostats
     *
     * @brief
     *
     */
    async editThermostats() {

        this.startWait();
        setTimeout(()=>{
            const dlgData = {
                partMap: this.partMap,
            };
            const dialogConfig = new MatDialogConfig();
            dialogConfig.data = dlgData;
            //dialogConfig.minWidth = '300px';
            dialogConfig.autoFocus = false;
            dialogConfig.disableClose = true;
            dialogConfig.panelClass = 'edit-thermostats-container';
            dialogConfig.restoreFocus = false;

            const dlgRef = this.matDialog.open(EditStats, dialogConfig);

            dlgRef.afterOpened().subscribe(()=>{
                this.progressFlag = false;
            });
        }, 10);
    }

    /***********************************************************************************************
     * @fn          showLogs
     *
     * @brief
     *
     */
    showLogs() {

        this.startWait();
        setTimeout(()=>{
            const dialogConfig = new MatDialogConfig();
            dialogConfig.data = JSON.stringify(this.msgLogs); //[...this.msgLogs];
            dialogConfig.width = '65%';
            dialogConfig.autoFocus = false;
            dialogConfig.disableClose = true;
            dialogConfig.panelClass = 'show-logs-container';
            dialogConfig.restoreFocus = false;

            const dlgRef = this.matDialog.open(ShowLogs, dialogConfig);
            dlgRef.afterOpened().subscribe(()=>{
                this.progressFlag = false;
            });
        }, 10);
    }

    /***********************************************************************************************
     * fn          showTooltip
     *
     * brief
     *
     */
    showTooltip(tt: MatTooltip, attr: gIF.hostedAttr_t) {
        let ttMsg = '';
        ttMsg += `attr-name: ${attr.name} \n`;
        ttMsg += `S/N: ${this.utils.extToHex(attr.extAddr)} \n`;
        const partDesc: gIF.part_t = this.partMap.get(attr.partNum);
        if(partDesc) {
            ttMsg += `node-name: ${partDesc.devName} \n`;
            ttMsg += `part: ${partDesc.part} \n`;
            ttMsg += `url: ${partDesc.url} \n`;
        }
        tt.message = ttMsg;
        tt.showDelay = 500;
        tt.tooltipClass = 'attr-tooltip';
        tt.show();
    }

    /***********************************************************************************************
     * fn          scrollSelChange
     *
     * brief
     *
     */
     scrollSelChange(scroll){

        console.log(scroll);
        if(scroll.value){
            if(scroll.value.name !== DUMMY_SCROLL){
                const x = 0;
                const y = (scroll.value.yPos * this.imgDim.height) / 100;

                this.floorPlanRef.nativeElement.scrollTo({
                    top: y,
                    left: x,
                    behavior: 'smooth'
                });
                setTimeout(() => {
                    this.selScroll = this.scrolls[0];
                }, 1000);
            }
        }
    }

    /***********************************************************************************************
     * fn          onResize
     *
     * brief
     *
     */
    onResize(event) {

        const rect = event.contentRect;
        console.log(`w: ${rect.width}, h: ${rect.height}`);
        const el = this.containerRef.nativeElement;

        this.imgDim.width = rect.width;
        this.imgDim.height = Math.round((rect.width / this.bkgImgWidth) * this.bkgImgHeight);
        this.ngZone.run(()=>{
            this.renderer.setStyle(el, 'height', `${this.imgDim.height}px`);
        });
    }

    /***********************************************************************************************
     * fn          dismissLoading
     *
     * brief
     *
     *
    dismissLoading() {
        this.loading.dismiss().then(
            ()=>{
                this.loadingController
                    .create({
                        message: '... wait',
                        duration: 10000,
                        mode: 'md',
                    })
                    .then(
                        (loading)=>{
                            this.loading = loading;
                        },
                        (err)=>{
                            console.log(err);
                        }
                    );
            },
            (err)=>{
                console.error(err);
            }
        );
    }
    */

    /***********************************************************************************************
     * fn          tempEvent
     *
     * brief
     *
     */
    async tempEvent(event: gIF.tempEvent_t){

        const key = this.storage.thermostatKey(event.extAddr, event.endPoint);
        const nvThermostat = this.storage.nvThermostatsMap.get(key);
        if(nvThermostat){
            if(nvThermostat.actuators.length){
                let changed = false;
                if(nvThermostat.setPoint !== nvThermostat.prevSetPoint){
                    changed = true;
                    nvThermostat.prevSetPoint = nvThermostat.setPoint;
                    nvThermostat.workPoint = nvThermostat.setPoint - nvThermostat.hysteresis;
                }
                if(event.temp > nvThermostat.workPoint){
                    if(nvThermostat.workPoint > nvThermostat.setPoint){
                        changed = true;
                        nvThermostat.workPoint = nvThermostat.setPoint - nvThermostat.hysteresis;
                    }
                }
                if(event.temp < nvThermostat.workPoint){
                    if(nvThermostat.workPoint < nvThermostat.setPoint){
                        changed = true;
                        nvThermostat.workPoint = nvThermostat.setPoint + nvThermostat.hysteresis;
                    }
                }
                if(changed){
                    await this.storage.storeThermostat(nvThermostat);
                }

                let cmd = 0x00; // OFF
                if(event.temp < nvThermostat.workPoint){
                    cmd = 0x01; // ON
                }
                for(const on_off of nvThermostat.actuators){
                    const zclCmd = {} as gIF.udpZclReq_t;
                    zclCmd.ip = '0.0.0.0';  // not used
                    zclCmd.port = 0;        // not used
                    zclCmd.extAddr = on_off.extAddr;
                    zclCmd.endPoint = on_off.endPoint;
                    zclCmd.clusterID = gConst.CLUSTER_ID_GEN_ON_OFF;
                    zclCmd.hasRsp = 0;
                    zclCmd.cmdLen = 3;
                    zclCmd.cmd = [];
                    zclCmd.cmd[0] = 0x11; // cluster spec cmd, not manu spec, client to srv dir, disable dflt rsp
                    zclCmd.cmd[1] = 0x00; // seq num -> not used
                    zclCmd.cmd[2] = cmd;  // ON/OFF command
                    this.serialLink.udpZclCmd(JSON.stringify(zclCmd));
                }
            }
        }
    }

    /***********************************************************************************************
     * fn          startWait
     *
     * brief
     *
     */
    startWait(){
        this.progressFlag = true;
        this.waitMsg = 'wait...';
        /*
        this.msgIdx = 0;
        setTimeout(() => {
            this.incrWait();
        }, 250);
        */
    }

    /***********************************************************************************************
     * fn          incrWait
     *
     * brief
     *
     */
    incrWait(){
        if(this.progressFlag === true){
            const strArr = wait_msg.split('');
            strArr[this.msgIdx] = 'x';
            this.waitMsg = strArr.join('');
            this.msgIdx++;
            if(this.msgIdx === wait_msg.length){
                this.msgIdx = 0;
            }
            setTimeout(() => {
                this.incrWait();
            }, 250);
        }
    }
}
