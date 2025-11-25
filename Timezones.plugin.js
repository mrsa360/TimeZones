/**
 * @name Timezones
 * @author mrsa360
 * @description Allows you to display other Users' local times.
 * @version 1.0.3
 * @source https://github.com/mrsa360/TimeZones.git
 * @updateurl https://raw.githubusercontent.com/mrsa360/TimeZones/main/Timezones.plugin.js
 */

/* ### CONFIG START ### */
const config = {
  "info": {
    "name": "Timezones",
    "version": "1.4.3",
    "description": "Displays users' local time inside their profile with improved theme support."
  },
  "changelog": [
    {
      "type": "fixed",
      "title": "Improvements",
      "items": [
        "Improved compatibility for light and dark themes.",
        "Updated text colors to follow Discord's theme variables.",
        "Ensured the badge uses Discord's font consistently.",
        "Badge background is no longer transparent."
      ]
    }
  ]
};
/* ### CONFIG END ### */


const { Data, React, DOM, Webpack, ContextMenu, UI, Components, Patcher } = new BdApi("Timezones");

const baseConfig = {
    info: {
        name: "Timezones",
        authors: [{ name: "mrsa360" }],
        github_raw: "https://raw.githubusercontent.com/mrsa360/TimeZones/main/Timezones.plugin.js",
        version: "1.0.3",
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
    background-color: var(--background-tertiary);
    border-radius: 6px;
    font-weight: 500;
    color: var(--text-muted);
}

.timezone-badge {
    position: absolute;
    top: 10px;
    left: 10px;
    background-color: var(--background-tertiary);
    padding: 4px 8px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-normal);
    pointer-events: none;
}
`;

const Tooltip = Components.Tooltip;
const Markdown = Webpack.getModule(m => m?.rules && m?.defaultProps?.parser);
const SearchableSelect = Webpack.getModule(m => m?.toString?.().includes("formatOption"));
const ProfileBanner = Webpack.getModule(m => m?.Z?.toString?.().includes("banner"));
const MessageHeader = Webpack.getModule(m => m?.Z?.toString?.().includes("getMessageAuthor"));
const i18n = Webpack.getByKeys("getLocale");

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
    }

    start() {
        DOM.addStyle("TZ-Styles", Styles);

        ContextMenu.patch("user-context", this.userContextPatch);

        Patcher.after(ProfileBanner, "Z", (_, [props], ret) => {
            const id = props.user.id;
            if (!this.hasTimezone(id)) return ret;

            const shortT = this.getTime(id, Date.now(), { hour: "numeric", minute: "numeric" });

            const badge = React.createElement(
                Tooltip,
                {
                    text: this.getTime(id, Date.now(), {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "numeric",
                        minute: "numeric"
                    }) + ` (${DataStore[id]})`
                },
                p => React.createElement("div", { ...p, className: "timezone-badge" }, shortT)
            );

            ret.props.children.push(badge);
            return ret;
        });

        Patcher.after(MessageHeader, "Z", (_, [props], ret) => {
            if (!DataStore.settings.showInMessage) return ret;
            if (!props.message?.author?.id) return ret;

            const id = props.message.author.id;
            if (!this.hasTimezone(id)) return ret;

            const shortT = this.getTime(id, props.message.timestamp, { hour: "numeric", minute: "numeric" });

            ret.props.children.push(
                React.createElement(
                    Tooltip,
                    {
                        text: this.getTime(id, props.message.timestamp, {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                            hour: "numeric",
                            minute: "numeric"
                        }) + ` (${DataStore[id]})`
                    },
                    p => React.createElement("span", { ...p, className: "timezone" }, shortT)
                )
            );

            return ret;
        });
    }

    userContextPatch = (menu, props) => {
        const userId = props.user?.id;
        if (!userId) return;

        const items = menu.props.children;
        items.push(
            ContextMenu.buildItem({ type: "separator" }),
            ContextMenu.buildItem({
                type: "submenu",
                label: "Timezones",
                children: [
                    this.hasTimezone(userId) &&
                        ContextMenu.buildItem({
                            type: "text",
                            disabled: true,
                            label: DataStore[userId]
                        }),
                    ContextMenu.buildItem({
                        label: this.hasTimezone(userId) ? "Change Timezone" : "Set Timezone",
                        action: () => this.setTimezone(userId, props.user)
                    }),
                    ContextMenu.buildItem({
                        label: "Remove Timezone",
                        danger: true,
                        disabled: !this.hasTimezone(userId),
                        action: () => this.removeTimezone(userId, props.user)
                    })
                ].filter(Boolean)
            })
        );
    };

    hasTimezone(id) {
        return typeof DataStore[id] === "string";
    }

    setTimezone(id, user) {
        let selected = DataStore[id] || null;

        const options = Intl.supportedValuesOf("timeZone").map(tz => {
            const offset = new Intl.DateTimeFormat(undefined, {
                timeZone: tz,
                timeZoneName: "short"
            })
                .formatToParts(new Date())
                .find(p => p.type === "timeZoneName").value;

            return { label: `${tz} (${offset})`, value: tz };
        });

        const Selector = () => {
            const [value, set] = React.useState(selected);

            return React.createElement(SearchableSelect, {
                options,
                closeOnSelect: true,
                value: options.find(o => o.value === value),
                onChange: v => {
                    selected = v.value;
                    set(v.value);
                }
            });
        };

        UI.showConfirmationModal(
            `Set Timezone for ${user.username}`,
            [
                React.createElement(Markdown, null, "Select the user's timezone:"),
                React.createElement(Selector)
            ],
            {
                confirmText: "Save",
                onConfirm: () => {
                    DataStore[id] = selected;
                    UI.showToast(`Timezone saved for ${user.username}`);
                }
            }
        );
    }

    removeTimezone(id, user) {
        delete DataStore[id];
        UI.showToast(`Timezone removed for ${user.username}`);
    }

    getTime(id, timestamp, props) {
        const tz = DataStore[id];
        if (!tz) return null;

        return new Intl.DateTimeFormat(i18n.getLocale(), {
            hourCycle: DataStore.settings.twentyFourHours ? "h23" : "h12",
            timeZone: tz,
            timeZoneName: DataStore.settings.showOffset ? "shortOffset" : undefined,
            ...props
        }).format(new Date(timestamp));
    }

    stop() {
        Patcher.unpatchAll();
        ContextMenu.unpatch("user-context", this.userContextPatch);
        DOM.removeStyle("TZ-Styles");
    }

    getSettingsPanel() {
        return React.createElement(TimezonesPanel);
    }
}

module.exports = Timezones;
