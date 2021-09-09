// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import api from './supos-api'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'

let rootPath = ''

const fileExists = async (path: string) => !!(await fs.stat(path).catch(e => false));

async function getChildrenTemplates(parentId: Number) {
	return await api.invoke('templates', {appName: api.suposConfig.information.app}, {pid: parentId})
}

async function getTemplateInstances(templateId: Number) {
	return await api.invoke('instances', {pageIndex: 1, pageSize: 50, needSystemAttributeValue: true, needNormalAttributeValue: true}, {tid: templateId})
}

async function getInsanceServices(templateId: Number, instanceId: Number) {
	return await api.invoke('services', {pageIndex: 1, pageSize: 50, needSystemAttributeValue: true, needNormalAttributeValue: true}, {tid: templateId, iid: instanceId})
}

async function getServiceToScriptMap(scriptPath: string) {
	const mapFilePath = path.join(rootPath, 'service-to-script-map.json')
	if (!await fileExists(mapFilePath)) {
		return undefined
	}
	try {
		const buffer = await fs.readFile(mapFilePath)
		const map = JSON.parse(buffer.toString())
		const found = map.find((m: any) => path.join(rootPath, m.localPath) == scriptPath)

		return found
	} catch(e) {
		return undefined
	}
}

const checkService = (response: any) => {
	if (!response || response.status) {
		return {
			success: false,
			message: 'Request failed! please try again later!'
		}
	} else {
		if (response.code == 200 && !response.data) {
			return {
				success: false,
				message: 'Service not found.'
			}
		}

		return {
			success: true,
			service: response.data,
			message: 'ok'
		}
	}
}

const checkUpdateService = (response: any) => {
	if (!response || response.status) {
		return {
			success: false,
			message: 'Request failed! please try again later!'
		}
	} else {
		return {
			success: true,
			service: response.data,
			message: 'ok'
		}
	}
}

const checkDebugService = (response: any) => {
	if (!response || response.status) {
		if (response && (response.status == 404 || response.status == 401)) {
			return {
				success: false,
				message: 'Request failed! please try again later!'
			}
		} else {
			return {
				success: true,
				data: response.data,
				message: 'ok'
			}
		}
	} else {
		return {
			success: true,
			data: response,
			message: 'ok'
		}
	}
}

export function activate(context: vscode.ExtensionContext) {
	const channel = vscode.window.createOutputChannel('Supos Sync')
	vscode.commands.executeCommand('setContext', 'supos-sync.activated', true);

	if (vscode.workspace.workspaceFolders) {
		rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath
		if (fsSync.existsSync(path.join(rootPath, '.suposrc.json'))) {
			console.log('Congratulations, your extension "supos-sync" is now active!');
		} else {
			console.log('".suposrc.json" not found, "supos-sync" is not active!')
			return
		}
	} else {
		return
	}

	vscode.workspace.onDidSaveTextDocument(doc => {
		if (doc.uri.fsPath.endsWith('suposrc.json')) {
			api.init(rootPath)
		}
	})

	// .suposrc.json found, api needs this for HTTP request.
	api.init(rootPath)
	
	let disposableDebug = vscode.commands.registerCommand('supos-sync.debug', async (e: any) => {
		const scriptFilePath = e.fsPath
		if (!scriptFilePath) {
			vscode.window.showErrorMessage('Not a service script!')
			return
		}
		const serviceToScriptMap = await getServiceToScriptMap(scriptFilePath)
		if (!serviceToScriptMap) {
			vscode.window.showErrorMessage(`Service not found!`)
			return
		}

		const doc = await vscode.workspace.openTextDocument(scriptFilePath!)
		doc.save()
		const script = doc.getText()
		const response = await api.invoke('getService', {}, {
			tid: serviceToScriptMap.templateId,
			iid: serviceToScriptMap.instanceId,
			sid: serviceToScriptMap.serviceId
		})

		const result: {success: boolean, message: string, service?: any}  = checkService(response)
		if (!result.success) {
			vscode.window.showErrorMessage(result.message)
			return
		}

		const response2 = await api.invoke('updateService', {...result.service, script: script}, {
			tid: serviceToScriptMap.templateId,
			iid: serviceToScriptMap.instanceId,
			sid: serviceToScriptMap.serviceId
		})
		const result2 = checkUpdateService(response2)
		if (!result2.success) {
			vscode.window.showErrorMessage(result2.message)
			return
		}

		const [tplNs, tplName, insName, ns, svcName] = serviceToScriptMap.serviceName.split('.')
		const response3 = await api.invoke('debugService', {}, {
			tplNs: tplNs,
			tplName: tplName,
			insName: insName,
			ns: ns,
			svcName: svcName
		})
		const result3 = checkDebugService(response3)
		if (!result3.success) {
			vscode.window.showErrorMessage(result3.message)
			return
		}
		channel.clear()
		channel.appendLine(JSON.stringify(result3.data, null, 4))
		channel.show()
	});

	let disposableDownload = vscode.commands.registerCommand('supos-sync.download', async (e: any) => {
		const scriptFilePath = e.fsPath
		if (!scriptFilePath) {
			vscode.window.showErrorMessage('Not a service script!')
			return
		}
		const serviceToScriptMap = await getServiceToScriptMap(scriptFilePath)
		if (!serviceToScriptMap) {
			vscode.window.showErrorMessage(`Service not found!`)
			return
		}

		const response = await api.invoke('getService', {}, {
			tid: serviceToScriptMap.templateId,
			iid: serviceToScriptMap.instanceId,
			sid: serviceToScriptMap.serviceId
		})
		const result = checkService(response)
		if (!result.success) {
			vscode.window.showErrorMessage(result.message)
			return
		}
		await fs.writeFile(scriptFilePath, result.service.script)
		vscode.window.showInformationMessage('Pull service success!')
	})

	let disposableUpload = vscode.commands.registerCommand('supos-sync.upload', async (e: any) => {
		const scriptFilePath = e.fsPath
		if (!scriptFilePath) {
			vscode.window.showErrorMessage('Not a service script!')
			return
		}
		const serviceToScriptMap = await getServiceToScriptMap(scriptFilePath)
		if (!serviceToScriptMap) {
			vscode.window.showErrorMessage(`Service not found!`)
			return
		}

		const doc = await vscode.workspace.openTextDocument(scriptFilePath!)
		const script = doc.getText()
		const response = await api.invoke('getService', {}, {
			tid: serviceToScriptMap.templateId,
			iid: serviceToScriptMap.instanceId,
			sid: serviceToScriptMap.serviceId
		})
		const result = checkService(response)
		if (!result.success) {
			vscode.window.showErrorMessage(result.message)
			return
		}

		const response2 = await api.invoke('updateService', {...result.service, script: script}, {
			tid: serviceToScriptMap.templateId,
			iid: serviceToScriptMap.instanceId,
			sid: serviceToScriptMap.serviceId
		})
		const result2 = checkUpdateService(response2)
		if (result2.success) {
			vscode.window.showInformationMessage(`Push service success! Service ${serviceToScriptMap.serviceName} updated.`)
		} else {
			vscode.window.showErrorMessage(result2.message)
		}
	})

	let disposableDownloadAll = vscode.commands.registerCommand('supos-sync.download-all', async () => {
		let allServices: any = []
		let allServicesToLocalScriptMap: any = []

		// level 0 template list
		const responseL0Templates = await getChildrenTemplates(1)
		if (responseL0Templates.status) {
			vscode.window.showErrorMessage('Sync failed!')
			return
		}

		// level 1 entity template list
		const parentEntityTemplate = responseL0Templates.data.find((e: any) => e.type == 'ENTITY')
		const responseL1EntityTemplates = await getChildrenTemplates(parentEntityTemplate.id)
		
		// level 1 entity template instances exclude system templates
		const filteredL1EntityTemplates = responseL1EntityTemplates.data.filter((e: any) => e.leaf == false && e.appName == api.suposConfig.information.app)
		for (const tpl of filteredL1EntityTemplates) {
			const instances = await getTemplateInstances(tpl.id)
			// get instance services
			for (const ins of instances.data.data) {
				const services = await getInsanceServices(tpl.id, ins.system_id)
				allServicesToLocalScriptMap = [...allServicesToLocalScriptMap, ...services.data.data.map((svc: any) => ({
					localPath: `./src/services/${svc.templateId}_${svc.instanceId}_${svc.enName}.js`,
					serviceName: [ins.template.namespace, ins.template.enName, ins.system_en_name, svc.namespace, svc.enName].join('.'),
					description: [ins.template.displayName, ins.system_display_name, svc.displayName].join('.'),
					templateId: ins.template.id,
					instanceId: ins.system_id,
					serviceId: svc.id
				}))]
				allServices = [...allServices, ...services.data.data]
			}
		}
		
		// save all service data to a storage file
		const flStore = rootPath + '/service-store.json'
		await fs.writeFile(flStore, JSON.stringify(allServices, null, 4))

		// build & save service-to-local-script map file
		const flMap = rootPath + '/service-to-script-map.json'
		if (fsSync.existsSync(flMap)) {
			const buffer = await fs.readFile(flMap)
			const flMapJSON = JSON.parse(buffer.toString())
			for (const defaultMap of allServicesToLocalScriptMap) {
				const localMap = flMapJSON.find((e: any) => e.serviceName == defaultMap.serviceName)
				if (localMap && localMap.localPath && localMap.localPath != '' && localMap.localPath != defaultMap.localPath) {
					defaultMap.localPath = localMap.localPath
				}
			}

			await fs.writeFile(flMap + '.default', JSON.stringify(allServicesToLocalScriptMap, null, 4))
		}
		await fs.writeFile(flMap, JSON.stringify(allServicesToLocalScriptMap, null, 4))

		// save every service script to file
		const scriptDir = path.join(rootPath, 'src/services')
		if (!await fileExists(scriptDir)) { // services/ is the default dir for scripts
			fs.mkdir(scriptDir, {recursive: true})
		}
		for (const map of allServicesToLocalScriptMap) {
			const svc = allServices.find((e: any) => e.id == map.serviceId)
			if (svc) {
				const scriptFile = path.join(rootPath, map.localPath)
				try {
					await fs.writeFile(scriptFile, svc.script)
				} catch(e) {
					vscode.window.showErrorMessage(`Save ${scriptFile} failed`)
				}
			}
		}

		vscode.window.showInformationMessage('Sync completed.')
	})

	let disposableUploadAll = vscode.commands.registerCommand('supos-sync.upload-all', async () => {
		
	})

	context.subscriptions.push(disposableDebug);
	context.subscriptions.push(disposableDownload);
	context.subscriptions.push(disposableUpload);
	context.subscriptions.push(disposableDownloadAll);
	context.subscriptions.push(disposableUploadAll);
}

// this method is called when your extension is deactivated
export function deactivate() {
	vscode.commands.executeCommand('setContext', 'supos-sync.activated', false);
}
