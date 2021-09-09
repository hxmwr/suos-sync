import axios, { AxiosInstance } from "axios";
import * as vscode from 'vscode'
import * as path from 'path'

class ApiRequest {
    private http: AxiosInstance
    public suposConfig: any
    private apiConfig: any
    private pathToSveConfig: string

    constructor() {
        this.http = axios.create({timeout: 15000, withCredentials: true})
        this.suposConfig = null
        this.pathToSveConfig = ''
        this.apiConfig = {
            login: ['/inter-api/auth/login', 'post'],
            templates: [({pid}:{pid: number}) => `/project/dam/supngin/api/dam/template/${pid}/children`, 'get'],
            instances: [({tid}: {tid: number}) => `/project/dam/supngin/api/dam/template/normal/${tid}/instance`, 'get'],
            services: [({tid, iid}: {tid: number, iid: number}) => `/project/dam/supngin/api/dam/template/${tid}/instance/${iid}/service/list?type=own&pageIndex=1&pageSize=100`, 'get'],
            generator: ['/project/dam/supngin/api/dam/enname/generator?prefix=Service', 'get'],
            getService: [({tid, iid, sid}: {tid: number, iid: number, sid: number}) => `/project/dam/supngin/api/dam/template/${tid}/instance/${iid}/service/${sid}`, 'get'],
            createServcie: [({tid, iid}: {tid: number, iid: number}) => `/project/dam/supngin/api/dam/template/${tid}/instance/${iid}/service`, 'post'],
            updateService: [({tid, iid, sid}: {tid: number, iid: number, sid: number}) => `/project/dam/supngin/api/dam/template/${tid}/instance/${iid}/service/${sid}`, 'put'],
            debugService: [({tplNs, tplName, insName, ns, svcName}: {tplNs: string, tplName: string, insName: string, ns: string, svcName: string}) => `/project/dam/supngin/api/dam/runtime/${tplNs}/template/${tplName}/instance/${insName}/service/${ns}/${svcName}/debug`, 'post']
        }
    }

    async post(url: string, params: any = {}, type: string = 'normal') {
        try {
            const response = await this.http.post(url, params)
            return response.data
        } catch(e) {
            console.log(e)
            if (e.response && e.response.status == 401) {
                this.renewTicket()
            }
            if (e.response) {
                return e.response
            }
        }
    }

    async get(url: string, params: any = {}) {
        try {
            const response = await this.http.get(url, {params: params})
            return response.data
        } catch(e) {
            console.log(e)
            if (e.response && e.response.status == 401) {
                this.renewTicket()
            }
            if (e.response) {
                return e.response
            }
        }
    }

    async put(url: string, params: any = {}) {
        try {
            const response = await this.http.put(url, params)
            return response.data
        } catch(e) {
            console.log(e)
            if (e.response && e.response.status == 401) {
                this.renewTicket()
            }
            if (e.response) {
                return e.response
            }
        }
    }

    async invoke(api: string, params: any = {}, urlParams: any = {}) {
        let response, url
        const [path, method] = this.apiConfig[api]
        if (typeof(path) == 'function') {
            url = this.suposConfig.information.server + path(urlParams)
        } else {
            url = this.suposConfig.information.server + path 
        }

        if (method == 'post') {
            response = await this.post(url, params)
        } else if (method == 'get') {
            response = await this.get(url, {params: params})
        } else if (method == 'put') {
            response = await this.put(url, params)
        }

        return response
    }

    async renewTicket() {
        const response = await this.invoke('login', {userName: this.suposConfig.information.username, password: this.suposConfig.information.password})
        if (response.ticket) {
            this.http.defaults.headers.common.Authorization = `Bearer ${response.ticket}`
        }
        return response
    }

    async init(rootPath: string) {
        try {
            this.pathToSveConfig = path.join(rootPath,  '.suposrc.json')
            const doc = await vscode.workspace.openTextDocument(this.pathToSveConfig)
            this.suposConfig = JSON.parse(doc.getText())
        } catch(e) {
            console.log(e)
            vscode.window.showErrorMessage('Request failed! Please check file ".suposrc.json".')
            return
        }
        
        const response = await this.renewTicket()
        if (response.ticket) {
            vscode.commands.executeCommand('supos-sync.download-all')
        } else {
            vscode.window.showErrorMessage('Request failed! Please check file ".suposrc.json".')
        }
        return this.suposConfig
    }
}

export default new ApiRequest()
