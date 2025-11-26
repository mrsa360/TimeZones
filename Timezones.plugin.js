/**
 * @name Timezones
 * @version 1.0.5
 * @description Shows users' local time on their profile and allows setting custom timezones.
 * @author Manuel
 */

module.exports = class Timezones {
    start() {
        this.storeKey = "Timezones-UserData";
        this.data = BdApi.Data.load(this.storeKey, "data") || {};
        this.injectStyles();
        this.patchProfile();
    }

    stop() {
        BdApi.Patcher.unpatchAll("Timezones");
        BdApi.DOM.removeStyle("Timezones-Style");
    }

    injectStyles() {
        BdApi.DOM.addStyle("Timezones-Style", `
            .tz-badge {
                font-size: 14px;
                opacity: 0;
                transition: opacity .25s ease-in-out;
                padding: 4px 6px;
                margin-top: 4px;
                border-radius: 4px;
                width: max-content;
            }
            .theme-dark .tz-badge {
                background-color: rgba(255, 255, 255, 0.07);
                color: var(--text-normal);
            }
            .theme-light .tz-badge {
                background-color: rgba(0, 0, 0, 0.05);
                color: var(--text-normal);
            }
            .tz-badge.visible {
                opacity: 1;
            }

            .tz-setting-row {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-top: 12px;
            }
            .tz-input {
                background: var(--input-background);
                color: var(--text-normal);
                border: 1px solid var(--input-background);
                border-radius: 4px;
                padding: 6px;
            }
        `);
    }

    save() {
        BdApi.Data.save(this.storeKey, "data", this.data);
    }

    patchProfile() {
        const UserProfile = BdApi.Webpack.getModule(m => m?.type?.displayName === "UserProfileModal");
        if (!UserProfile) return;

        BdApi.Patcher.after("Timezones", UserProfile, "type", (thisArg, args, res) => {
            const user = args[0]?.user;
            if (!user) return res;

            const id = user.id;
            if (!res?.props?.children) return res;

            const section = BdApi.React.createElement("div", {
                className: "tz-badge",
                children: this.buildProfileText(id),
                ref: el => {
                    if (el) setTimeout(() => el.classList.add("visible"), 10);
                }
            });

            res.props.children.props.children.push(section);
            return res;
        });

        this.addSettingsPanel();
    }

    buildProfileText(id) {
        const tz = this.data[id];
        if (!tz) return "Timezone: Not Set";

        const now = new Date();
        try {
            const formatter = new Intl.DateTimeFormat("en-US", {
                hour: "numeric",
                minute: "numeric",
                hour12: true,
                timeZone: tz
            });
            return `Local Time: ${formatter.format(now)} (${tz})`;
        } catch {
            return `Local Time: Invalid (${tz})`;
        }
    }

    addSettingsPanel() {
        const Settings = BdApi.Settings;

        Settings.registerPanel("Timezones", () => {
            const panel = document.createElement("div");
            panel.className = "tz-setting-row";

            const label = document.createElement("div");
            label.textContent = "Your Timezone (Example: America/Chicago)";
            panel.appendChild(label);

            const input = document.createElement("input");
            input.className = "tz-input";
            input.placeholder = "Region/City";
            input.value = this.data["self"] || "";
            panel.appendChild(input);

            const saveBtn = document.createElement("button");
            saveBtn.textContent = "Save";
            saveBtn.className = "button-38aScr lookFilled-yCfaCM colorBrand-I6CyqQ sizeSmall-wU2dO-";
            saveBtn.onclick = () => {
                this.data["self"] = input.value.trim();
                this.save();
            };
            panel.appendChild(saveBtn);

            return panel;
        });
    }
};
