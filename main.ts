import { App, CachedMetadata, Editor, FrontMatterCache, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
	actions: Map<string, Action>;
}

// Targets, specifies whether the file should be affected by the rule
type Targets = {
	ParentFolder: string | null,
	HasTags: string[] | null,
	HasProperties: string[] | null,
}

// RuleGroup, is a condition that's checked to determine if a modification should occur
type RuleGroup = {
	Rules: Rule[],
	Operator: Op,
}
type Rule = {
	Type: AttrType,
	Check: RuleCheck,
	Not: boolean,
	
	ValueStrings: string[],
	ValueNum: number,
}
enum AttrType {
	Tag,
	Property,
	Link
}
enum RuleCheck {
	Has,

	Equal,
	GreaterThan,
	LessThan,
}
enum Op {
	And,
	Or,
}

// Modifications, are applied to a note if a `RuleGroup` evaluates to true
type Modification = {
	Add: boolean,
	Type: AttrType,
	Values: any[],
}

type Action = {
	targets: Targets,
	rules: RuleGroup,
	modifications: Modification[],
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	actions: new Map<string, Action>(),
}


// Modal UI
// Dropdown, with Plus button
// 

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-conditions-modal',
			name: 'Condition',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));

		this.app.metadataCache.on('changed', (file, data, _) => {
			// SHOULD this file be checked
			const fileMeta = this.app.metadataCache.getFileCache(file);
			if (fileMeta === null) {
				return;
			}
			this.settings.actions.forEach((act, _k) => {
				const isTarget = this.evaluateTarget(file, fileMeta, act.targets);
				if (!isTarget) {
					return;
				}
				
				// CHECK conditions
				if (this.meetsConditions(fileMeta, act.rules)) {
					// TODO: MODIFY
					this.modify(file, data, act.modifications);
				}
			})

		})
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	evaluateTarget(file: TFile, fileMeta: CachedMetadata, rules: Targets) {
		return (
			(rules.ParentFolder === null || file.path.startsWith(rules.ParentFolder)) &&
			(rules.HasTags === null || fileMeta.tags !== undefined && this.containsAll(rules.HasTags, fileMeta.tags.map(t => t.tag))) &&
			(rules.HasProperties === null || fileMeta.frontmatter !== undefined && this.containsAllKeys(rules.HasProperties, fileMeta.frontmatter))
		)
	}

	containsAll(targets: string[], arr: string[]): boolean {
		const m = new Map<string, boolean>();
		arr.forEach(el => {
			m.set(el, true);
		})

		for (let i = 0; i < targets.length; i++) {
			if (!m.has(targets[i])) {
				return false;
			}
		}
		return true;
	}

	containsAllKeys(targets: string[], m: FrontMatterCache): boolean {
		for (let i = 0; i < targets.length; i++) {
			if (m[targets[i]] === undefined) {
				return false;
			}
		}
		return true;
	}

	meetsConditions(fileMeta: CachedMetadata, rules: RuleGroup) {
		const results: boolean[] = [];
		rules.Rules.forEach(r => {
			let res: boolean = false;
			let value: string[];
			switch (r.Type) {
				case AttrType.Link:
					value = fileMeta.links ? fileMeta.links.map(l => l.link) : [];
					break;
				case AttrType.Property:
					value = fileMeta.frontmatter ? Object.keys(fileMeta.frontmatter) : [];
					break;
				case AttrType.Tag:
					value = fileMeta.tags ? fileMeta.tags.map(t => t.tag) : [];
					break;
			}

			switch(r.Check) {
				case RuleCheck.Has:
					res = this.containsAll(r.ValueStrings, value);
					break;
				case RuleCheck.Equal:
					res = value.length === r.ValueNum;
					break;
				case RuleCheck.GreaterThan:
					res = value.length > r.ValueNum;
					break;
				case RuleCheck.LessThan:
					res = value.length < r.ValueNum;
					break;
			}

			if (r.Not) {
				res = !res;
			}
			results.push(res);
		});
	
		if (rules.Operator === Op.And) {
			return results.reduce((acc, curr) => acc && curr, true);
		}
		return results.reduce((acc, curr) => acc || curr, false);
	}

	modify(file: TFile, data: string, modifications: Modification[]) {
		const modifiesFrontmatter = modifications.map(m => m.Type).includes(AttrType.Property)
		const properties: [string, string][] = [];
		if (modifiesFrontmatter) {
			const splitOnFrontmatter = data.split('---');
			let frontmatterString = '';
			if (splitOnFrontmatter.length > 2) {
				frontmatterString = splitOnFrontmatter[1];
				frontmatterString.split('\n').map(kv => kv.trim()).forEach(kv => {
					const parts = kv.split(':');
					if (parts.length < 2) {
						return;
					}
	
					const k = parts[0].trim();
					const v = parts[1].trim();
					properties.push([k, v]);
				})
			}
		}

		modifications.forEach(m => {
			switch(m.Type) {
				case AttrType.Link:
					break;
				case AttrType.Property:
					break;
				case AttrType.Tag:
					break;
			}
		});
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}