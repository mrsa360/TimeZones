/**
 * @name Timezones
 * @author mrsa360
 * @description Allows you to display other Users' local times.
 * @version 1.0.7
 * @source https://github.com/mrsa360/TimeZones.git
 * @updateurl https://raw.githubusercontent.com/mrsa360/TimeZones/main/Timezones.plugin.js
 */

const { Data, React, DOM, Webpack, ContextMenu, UI, Components, Patcher } = new BdApi("Timezones");

const baseConfig = {
    info: {
        name: "Timezones",
        authors: [{ name: "mrsa360" }],
        github_raw: "https://raw.githubusercontent.com/mrsa360/TimeZones/main/Timezones.plugin.js",
        version: "1.0.5",
        description: "Allows you to display other Users' local times."
    },
    defaultConfig: [
        { type: "switch", id: "twentyFourHours", name: "24 Hour Time", value: false },
        { type: "switch", id: "showInMessage", name: "Show local timestamp next to messages", value: true },
        { type: "switch", id: "showOffset", name: "Show GMT offset", value: false }
    ]
};

const DataStore = new Proxy(
    {},
    {
        get(_, key) {
            if (key === "settings") {
                const saved = Data.load("settings") || {};
                return baseConfig.defaultConfig.reduce((out, s) => {
                    out[s.id] = saved[s.id] ?? s.value;
                    return out;
                }, {});
            }
            return Data.load(key);
        },
        set(_, key, value) {
            Data.save(key, value);
            return true;
        },
        deleteProperty(_, key) {
            Data.delete(key);
            return true;
        }
    }
);

function loadDefaults() {
    if (!Data.load("settings")) {
        DataStore.settings = baseConfig.defaultConfig.reduce((o, s) => {
            o[s.id] = s.value;
            return o;
        }, {});
    }
}

const Styles = `
.timezone {
    margin-left: 6px;
    padding: 2px 6px;
    font-size: 12px;
    background: var(--background-secondary);
    border-radius: 6px;
    font-weight: 500;
    color: var(--text-muted);
}

.timezone-badge {
    position: absolute;
    top: 12px;
    left: 12px;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    background: var(--background-secondary);
    color: var(--text-normal);
    box-shadow: var(--elevation-low);
    opacity: 0;
    animation: tzBadgeIn 0.25s ease forwards;
    pointer-events: none;
    user-select: none;
}

@keyframes tzBadgeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
}
`;

const Tooltip = Components.Tooltip;
const Markdown = Webpack.getModule(m => m?.rules && m?.defaultProps?.parser);
let SearchableSelect;
try { SearchableSelect = Webpack.getModule(m => m?.toString?.().includes("formatOption")); } catch(e) { SearchableSelect = null; }
let ProfileBanner = null;
let MessageHeader = null;

const i18n = (() => {
    try { return Webpack.getByKeys("getLocale"); } catch(e) { return { getLocale: () => "en-US" }; }
})();

function findModules() {
    if (!ProfileBanner) {
        ProfileBanner = Webpack.getModule(m => {
            try {
                return (m && m.default && typeof m.default === "function" && /profile.*banner/i.test(m.default.toString())) || (m && m.Z && m.Z.toString && m.Z.toString().includes("banner"));
            } catch (e) { return false; }
        }) || Webpack.getModule(m => m?.Z?.toString?.().includes("banner")) || Webpack.getModule(m => m?.default?.displayName?.toLowerCase?.()?.includes("profile"));
    }
    if (!MessageHeader) {
        MessageHeader = Webpack.getModule(m => {
            try {
                return (m && m.Z && m.Z.toString && (m.Z.toString().includes("getMessageAuthor") || m.Z.toString().includes("message"))) || (m && m.default && m.default.displayName && /Message/.test(m.default.displayName));
            } catch (e) { return false; }
        }) || Webpack.getModule(m => m?.Z?.toString?.().includes("getMessageAuthor")) || Webpack.getModule(m => m?.default?.displayName?.toLowerCase?.()?.includes("message"));
    }
}

const TimezonesPanel = () => {
    const [settings, set] = React.useState({ ...DataStore.settings });

    return UI.buildSettingsPanel({
        settings: baseConfig.defaultConfig.map(s => ({ ...s, value: settings[s.id] })),
        onChange: (_, id, value) => {
            const newS = { ...settings, [id]: value };
            DataStore.settings = newS;
            set(newS);
        }
    });
};

class Timezones {
    constructor() {
        loadDefaults();
        findModules();
    }

    start() {
        DOM.addStyle("TZ-Styles", Styles);
        try { ContextMenu.patch("user-context", this.userContextPatch); } catch (e) {}
        try { if (ProfileBanner && ProfileBanner.Z) Patcher.after(ProfileBanner, "Z", this.profilePatch); else if (ProfileBanner && ProfileBanner.default) Patcher.after(ProfileBanner, "default", this.profilePatch); } catch(e){}
        try { if (MessageHeader && MessageHeader.Z) Patcher.after(MessageHeader, "Z", this.messagePatch); else if (MessageHeader && MessageHeader.default) Patcher.after(MessageHeader, "default", this.messagePatch); } catch(e){}
    }

    profilePatch = (_, [props], ret) => {
        try {
            const id = props.user?.id;
            if (!id || !this.hasTimezone(id)) return ret;
            const short = this.getTime(id, Date.now(), { hour: "numeric", minute: "numeric" });
            const tooltipText = this.getTime(id, Date.now(), {
                weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric"
            }) + ` (${DataStore[id]})`;
            ret.props.children.push(
                React.createElement(
                    Tooltip,
                    { text: tooltipText },
                    p => React.createElement("div", { ...p, className: "timezone-badge" }, short)
                )
            );
        } catch (e) {}
        return ret;
    };

    messagePatch = (_, [props], ret) => {
        try {
            if (!DataStore.settings.showInMessage) return ret;
            const id = props.message?.author?.id;
            if (!id || !this.hasTimezone(id)) return ret;
            const short = this.getTime(id, props.message.timestamp, { hour: "numeric", minute: "numeric" });
            const tooltipText = this.getTime(id, props.message.timestamp, {
                weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric"
            }) + ` (${DataStore[id]})`;
            ret.props.children.push(
                React.createElement(
                    Tooltip,
                    { text: tooltipText },
                    p => React.createElement("span", { ...p, className: "timezone" }, short)
                )
            );
        } catch (e) {}
        return ret;
    };

    userContextPatch = (menu, props) => {
        try {
            const userId = props.user?.id;
            if (!userId) return;
            const target = Array.isArray(menu.props.children) ? menu.props.children : (menu.props.children && menu.props.children[0] && menu.props.children[0].props && menu.props.children[0].props.children) || menu.props.children;
            const add = (itemsArray) => {
                if (Array.isArray(target)) {
                    target.push(...itemsArray);
                } else if (Array.isArray(target.children)) {
                    target.children.push(...itemsArray);
                }
            };
            const items = [
                ContextMenu.buildItem({ type: "separator" }),
                ContextMenu.buildItem({
                    type: "submenu",
                    label: "Timezones",
                    children: [
                        this.hasTimezone(userId) && ContextMenu.buildItem({ type: "text", disabled: true, label: DataStore[userId] }),
                        ContextMenu.buildItem({ label: this.hasTimezone(userId) ? "Change Timezone" : "Set Timezone", action: () => this.setTimezone(userId, props.user) }),
                        ContextMenu.buildItem({ label: "Remove Timezone", danger: true, disabled: !this.hasTimezone(userId), action: () => this.removeTimezone(userId, props.user) })
                    ].filter(Boolean)
                })
            ];
            add(items);
        } catch (e) {}
    };

    hasTimezone(id) {
        return typeof DataStore[id] === "string";
    }

    setTimezone(id, user) {
        try {
            const supported = Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : [];
            let chosen = DataStore[id] || "";
            if (supported && supported.length > 0) {
                const list = supported.join("\n");
                const input = window.prompt(`Enter timezone IANA name for ${user.username} (example: America/Los_Angeles)\n\nYou may paste one from the list below or type it:\n\n${supported.slice(0,200).join(", ")}`, chosen);
                if (!input) return;
                if (!supported.includes(input)) {
                    if (!confirm("The timezone you entered is not in the IANA list. Save anyway?")) return;
                }
                DataStore[id] = input;
                UI.showToast(`Timezone set to ${input} for ${user.username}`, { type: "success" });
            } else {
                const input = window.prompt(`Enter timezone IANA name for ${user.username} (example: America/Los_Angeles)`, chosen);
                if (!input) return;
                DataStore[id] = input;
                UI.showToast(`Timezone set to ${input} for ${user.username}`, { type: "success" });
            }
        } catch (e) {}
    }

    removeTimezone(id, user) {
        try {
            delete DataStore[id];
            UI.showToast(`Timezone removed for ${user.username}`, { type: "success" });
        } catch (e) {}
    }

    getTime(id, timestamp, props) {
        try {
            const tz = DataStore[id];
            if (!tz) return null;
            return new Intl.DateTimeFormat(i18n.getLocale?.() || "en-US", {
                hourCycle: DataStore.settings.twentyFourHours ? "h23" : "h12",
                timeZone: tz,
                timeZoneName: DataStore.settings.showOffset ? "shortOffset" : undefined,
                ...props
            }).format(new Date(timestamp));
        } catch (e) { return null; }
    }

    stop() {
        try {
            Patcher.unpatchAll();
            ContextMenu.unpatch("user-context", this.userContextPatch);
            DOM.removeStyle("TZ-Styles");
        } catch (e) {}
    }

    getSettingsPanel() {
        return React.createElement(TimezonesPanel);
    }
}

module.exports = Timezones;
