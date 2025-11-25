/**
 * @name Timezones
 * @author mrsa360
 * @description Allows you to display other Users' local times.
 * @version 1.0.3
 * @source https://github.com/mrsa360/TimeZones.git
 * @updateurl https://raw.githubusercontent.com/mrsa360/TimeZones/main/Timezones.plugin.js
 */

const { Data, React, DOM, Webpack, ContextMenu, UI, Components, Patcher } = new BdApi('Timezones');

const baseConfig = {
    info: {
        name: "Timezones",
        authors: [{ name: "mrsa360" }],
        github_raw: "https://raw.githubusercontent.com/mrsa360/TimeZones/main/Timezones.plugin.js",
        version: "1.0.3",
        description: "Allows you to display other Users' local times.",
    },
    defaultConfig: [
        { type: "switch", id: "twentyFourHours", name: "24-Hour Time", value: false },
        { type: "switch", id: "showInMessage", name: "Show time next to messages", value: true },
        { type: "switch", id: "showOffset", name: "Show GMT Offset (e.g., GMT-8)", value: false },
    ],
};

const DataStore = new Proxy({}, {
    get: (_, key) => {
        if (key === 'settings') {
            const saved = Data.load(key) || {};
            return baseConfig.defaultConfig.reduce((acc, s) => {
                acc[s.id] = saved[s.id] ?? s.value;
                return acc;
            }, {});
        }
        return Data.load(key);
    },
    set: (_, key, value) => (Data.save(key, value), true),
    deleteProperty: (_, key) => (Data.delete(key), true)
});

function loadDefaults() {
    if (!Data.load('settings')) {
        DataStore.settings = baseConfig.defaultConfig.reduce((acc, s) => (acc[s.id] = s.value, acc), {});
    }
}

const config = {
    ...baseConfig,
    defaultConfig: baseConfig.defaultConfig.map(s => ({ ...s, value: DataStore.settings[s.id] }))
};

const Styles = `
.timezone {
    margin-left: 0.5rem;
    font-size: 0.75rem;
    line-height: 1.375rem;
    vertical-align: baseline;
    display: inline-block;
    height: auto;
    cursor: default;
    font-weight: 500;

    padding: 2px 6px;
    border-radius: 10px;
    font-family: var(--font-primary);
    background: var(--background-secondary-alt);
    color: var(--text-normal);
}
[class*="compact"] .timezone { display: inline; }

.timezone-badge {
    position: absolute;
    top: 10px;
    left: 10px;
    padding: 4px 8px;

    background: var(--background-secondary-alt);
    color: white !important;
    border-radius: 10px;

    font-family: var(--font-primary);
    font-size: 0.75rem;
    font-weight: 600;
}
`;

const Markdown = Webpack.getModule(m => m?.rules && m?.defaultProps?.parser);
const SearchableSelect = Webpack.getByStrings("formatOption", "options", "hideTags", { searchExports: true });
const ProfileBanner = Webpack.getByStrings(`"canUsePremiumProfileCustomization"`, { defaultExport: false });
const MessageHeader = Webpack.getModule(Webpack.Filters.byStrings("userOverride", "withMentionPrefix"));
const Tooltip = Components.Tooltip;
const i18n = Webpack.getByKeys("getLocale");

const TimezonesPanel = () => {
    const [settings, setSettings] = React.useState({ ...DataStore.settings });

    const updateSetting = (id, value) => {
        const newSettings = { ...settings, [id]: value };
        setSettings(newSettings);
        DataStore.settings = newSettings;
    };

    return UI.buildSettingsPanel({
        settings: config.defaultConfig.map(s => ({ ...s, value: settings[s.id] })),
        onChange: (_, id, value) => updateSetting(id, value)
    });
};

class Timezones {
    constructor() { loadDefaults(); }

    start() {
        DOM.addStyle("Timezones-Styles", Styles);

        ContextMenu.patch("user-context", this.userContextPatch);

        // Profile badge
        Patcher.after(ProfileBanner, "Z", (_, [props], ret) => {
            if (!this.hasTimezone(props.user.id)) return;

            ret.props.children = React.createElement(Tooltip, {
                text: this.getTime(props.user.id, Date.now(), {
                    weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric"
                }) + ` (${DataStore[props.user.id]})`,
                children: p =>
                    React.createElement("div", { ...p, className: "timezone-badge" },
                        this.getTime(props.user.id, Date.now(), { hour: "numeric", minute: "numeric" })
                    )
            });
        });

        // Chat timestamps
        Patcher.after(MessageHeader, "Z", (_, [props], ret) => {
            if (props.isRepliedMessage || !DataStore.settings.showInMessage) return;
            if (!this.hasTimezone(props.message.author.id)) return;

            ret.props.children.push(
                React.createElement(Tooltip, {
                    text: this.getTime(props.message.author.id, props.message.timestamp, {
                        weekday: "long", year: "numeric", month: "long", day: "numeric",
                        hour: "numeric", minute: "numeric"
                    }) + ` (${DataStore[props.message.author.id]})`,
                    children: p =>
                        React.createElement("span", { ...p, className: "timezone" },
                            this.getTime(props.message.author.id, props.message.timestamp, {
                                hour: "numeric", minute: "numeric"
                            })
                        )
                })
            );
        });
    }

    userContextPatch = (ret, props) => {
        const isDM = !Array.isArray(ret.props.children[0].props.children);
        const menu = isDM ? ret.props.children : ret.props.children[0].props.children;

        menu.push([
            ContextMenu.buildItem({ type: "separator" }),
            ContextMenu.buildItem({
                type: "submenu",
                label: "Timezones",
                children: [
                    DataStore[props.user.id] &&
                    ContextMenu.buildItem({ type: "text", disabled: true, label: DataStore[props.user.id] }),
                    ContextMenu.buildItem({
                        label: DataStore[props.user.id] ? "Change Timezone" : "Set Timezone",
                        action: () => this.setTimezone(props.user.id, props.user)
                    }),
                    ContextMenu.buildItem({
                        label: "Remove Timezone",
                        danger: true,
                        disabled: !this.hasTimezone(props.user.id),
                        action: () => this.removeTimezone(props.user.id, props.user)
                    })
                ].filter(Boolean)
            })
        ]);
    };

    hasTimezone(id) { return !!DataStore[id] && !Array.isArray(DataStore[id]); }

    setTimezone(id, user) {
        let outvalue = null;

        const options = Intl.supportedValuesOf("timeZone").map(tz => {
            const offset = new Intl.DateTimeFormat(undefined, {
                timeZone: tz,
                timeZoneName: "short"
            }).formatToParts(new Date()).find(p => p.type === "timeZoneName").value;

            return { label: `${tz} (${offset})`, value: tz };
        });

        const SelectWrapper = () => {
            const [value, setValue] = React.useState(DataStore[id] || null);

            return React.createElement(SearchableSelect, {
                options,
                value: options.find(o => o.value === value),
                placeholder: "Select a Timezone",
                maxVisibleItems: 5,
                closeOnSelect: true,
                onChange: v => { setValue(v); outvalue = v; }
            });
        };

        UI.showConfirmationModal(
            `Set Timezone — ${user.username}`,
            [
                React.createElement(Markdown, null, "Please select a timezone."),
                React.createElement(SelectWrapper)
            ],
            {
                confirmText: "Set",
                onConfirm: () => {
                    DataStore[id] = outvalue;
                    UI.showToast(`Timezone set to ${outvalue} for ${user.username}`, { type: "success" });
                }
            }
        );
    }

    removeTimezone(id, user) {
        delete DataStore[id];
        UI.showToast(`Timezone removed for ${user.username}`, { type: "success" });
    }

    getTime(id, time, props) {
        const tz = DataStore[id];
        if (!tz) return null;

        return new Intl.DateTimeFormat(
            i18n?.getLocale?.() || "en-US",
            {
                hourCycle: DataStore.settings.twentyFourHours ? "h23" : "h12",
                timeZone: tz,
                timeZoneName: DataStore.settings.showOffset ? "shortOffset" : undefined,
                ...props
            }
        ).format(new Date(time));
    }

    stop() {
        Patcher.unpatchAll();
        ContextMenu.unpatch("user-context", this.userContextPatch);
        DOM.removeStyle("Timezones-Styles");
    }

    getSettingsPanel() { return React.createElement(TimezonesPanel); }
}

module.exports = Timezones;
