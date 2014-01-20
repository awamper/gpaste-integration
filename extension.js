const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Panel = imports.ui.panel;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Clutter = imports.gi.Clutter;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const GPasteIntegration = Me.imports.gpaste_integration;
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;

const SIGNAL_IDS = {
    ENABLE_SHORTCUTS: 0
};

const GPasteIntegrationButton = new Lang.Class({
    Name: 'GPasteIntegrationButton',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(0.0, "gpaste-integration");

        let icon = new St.Icon({
            icon_name: Utils.ICONS.indicator,
            style_class: 'system-status-icon'
        });
        this.actor.add_child(icon);

        this._gpaste = new GPasteIntegration.GPasteIntegration();
        this._gpaste.client.connect(
            'tracking',
            Lang.bind(this, function(c, state) {
                if(state) {
                    this.actor.opacity = 255;
                }
                else {
                    this.actor.opacity = 120;
                }
            })
        );

        this._add_menu_items();

        if(Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_SHORTCUTS_KEY)) {
            this.add_keybindings();
        }

        SIGNAL_IDS.ENABLE_SHORTCUTS =
            Utils.SETTINGS.connect('changed::'+PrefsKeys.ENABLE_SHORTCUTS_KEY,
                Lang.bind(this, function() {
                    let enable = Utils.SETTINGS.get_boolean(
                        PrefsKeys.ENABLE_SHORTCUTS_KEY
                    );

                    if(enable) this.add_keybindings();
                    else this.remove_keybindings();
                })
            );
    },

    _onButtonPress: function(actor, event) {
        let button = event.get_button();

        switch(button) {
            case Clutter.BUTTON_SECONDARY:
                this.menu.toggle();
                break;
            case Clutter.BUTTON_MIDDLE:
                break;
            default:
                this._gpaste.toggle();
                break;
        }
    },

    _add_menu_items: function() {
        let track_item = new PopupMenu.PopupSwitchMenuItem("Track changes", true);
        track_item.connect('toggled', Lang.bind(this, function() {
            this._gpaste.client.track(track_item.state);
        }));
        this._gpaste.client.connect('tracking', Lang.bind(this, function(c, state) {
            track_item.setToggleState(state);
        }));
        this.menu.addMenuItem(track_item);

        let clear_history_item = new PopupMenu.PopupMenuItem('Clear history');
        clear_history_item.connect('activate', Lang.bind(this, function() {
            this._gpaste.client.empty();
        }));
        this.menu.addMenuItem(clear_history_item);

        let preferences_item = new PopupMenu.PopupMenuItem("Preferences");
        preferences_item.connect("activate", Lang.bind(this, function() {
            Utils.launch_extension_prefs(Me.uuid);
            this._gpaste.hide(false);
        }));
        this.menu.addMenuItem(preferences_item);
    },

    on_state_changed: function(state) {
        this._gpaste.client.on_extension_state_changed(state);
    },

    add_keybindings: function() {
        Main.wm.addKeybinding(
            PrefsKeys.SHOW_CLIPBOARD_CONTENTS_KEY,
            Utils.SETTINGS,
            Meta.KeyBindingFlags.NONE,
            Shell.KeyBindingMode.NORMAL |
            Shell.KeyBindingMode.MESSAGE_TRAY |
            Shell.KeyBindingMode.OVERVIEW,
            Lang.bind(this, function() {
                this._gpaste.show_current_contents();
            })
        );
    },

    remove_keybindings: function() {
        Main.wm.removeKeybinding(PrefsKeys.SHOW_CLIPBOARD_CONTENTS_KEY);
    },

    destroy: function() {
        if(SIGNAL_IDS.ENABLE_SHORTCUTS > 0) {
            Utils.SETTINGS.disconnect(SIGNAL_IDS.ENABLE_SHORTCUTS);
        }

        this.remove_keybindings();
        this._gpaste.destroy();
        this.parent();
    }
});

let gpaste_button;

function init(extension) {
    // nothing
}

function enable() {
    gpaste_button = new GPasteIntegrationButton();
    gpaste_button.on_state_changed(true);
    Main.panel.addToStatusArea('gpaste_integration', gpaste_button);
}

function disable() {
    gpaste_button.on_state_changed(false);
    gpaste_button.destroy();
}
