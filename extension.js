const St = imports.gi.St;
const Lang = imports.lang;
const Gio = imports.gi.Gio;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Panel = imports.ui.panel;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Clutter = imports.gi.Clutter;
const Tweener = imports.ui.tweener;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const GPasteIntegration = Me.imports.gpaste_integration;
const GPasteHistory = Me.imports.gpaste_history;
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const GPasteClient = Me.imports.gpaste_client;
const PinnedItemsManager = Me.imports.pinned_items_manager;
const Tooltips = Me.imports.tooltips;

const SIGNAL_IDS = {
    ENABLE_SHORTCUTS: 0,
    BUS_WATCHER: 0
};

const TIMEOUT_IDS = {
    SHOW_PREVIEW: 0
}

const MAX_PINNED_ITEM_LENGTH = 70;

const GPasteEntryMenuItem = new Lang.Class({
    Name: 'GPasteEntryMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(params) {
        this.parent(params);

        this._hint_text = 'Add item';

        let primary_icon = new St.Icon({
            icon_name: 'list-add-symbolic',
            icon_size: 20,
            reactive: false
        });
        this.entry = new St.Entry({
            hint_text: this._hint_text
        });

        this.entry.set_primary_icon(primary_icon);
        this.entry.clutter_text.connect('activate', Lang.bind(this, this.activate));
        this.actor.add(this.entry, {
            expand: true,
            x_align: St.Align.START
        });
    },

    _onButtonReleaseEvent: function(actor, event) {
        return true;
    },

    _onKeyFocusIn: function(actor) {
        return;
    },

    _onKeyFocusOut: function(actor) {
        return;
    },

    activate: function() {
        this.emit('activate', this.entry_text);
    },

    get entry_text() {
        return this.entry.text === this._hint_text ? '' : this.entry.text;
    }
});

const GPasteIntegrationButton = new Lang.Class({
    Name: 'GPasteIntegrationButton',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(0.0, "gpaste-integration");

        this.actor.connect(
            'enter-event',
            Lang.bind(this, this._on_enter)
        );
        this.actor.connect(
            'leave-event',
            Lang.bind(this, this._on_leave)
        );
        this.menu.connect('menu-closed',
            Lang.bind(this, function() {
                if(this._new_pinned_item) {
                    this._new_pinned_item.entry.set_text('');
                }
            })
        );

        let icon = new St.Icon({
            icon_name: Utils.ICONS.indicator,
            style_class: 'system-status-icon'
        });

        this._icons_table = new St.Table();
        this._icons_table.add(icon, {
            row: 0,
            col: 0
        });
        this.actor.add_child(this._icons_table);

        PinnedItemsManager.get_manager().connect(
            'changed',
            Lang.bind(this, this._on_pinned_items_changed)
        );

        this._gpaste = new GPasteIntegration.GPasteIntegration();
        this._gpaste.connect('shown',
            Lang.bind(this, function() {
                this._remove_timeout();
                this._gpaste.hide_clipboard_preview();
                this.actor.add_style_pseudo_class('active');
            })
        );
        this._gpaste.connect('hidden',
            Lang.bind(this, function() {
                this._remove_timeout();
                this._gpaste.hide_clipboard_preview();
                this.actor.remove_style_pseudo_class('active');
            })
        );
        this._gpaste.history.connect(
            'changed',
            Lang.bind(this, this._on_history_changed)
        );
        this._gpaste.progress_bar.actor.connect(
            'show',
            Lang.bind(this, this._reposition_progress_bar)
        );

        GPasteClient.get_client().connect(
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

        this._update_menu_items();

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

    _on_enter: function() {
        if(!Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_PREVIEW_ON_HOVER_KEY)) {
            return;
        }

        this._remove_timeout();
        let timeout = Utils.SETTINGS.get_int(
            PrefsKeys.PREVIEW_ON_HOVER_TIMEOUT_KEY
        );
        TIMEOUT_IDS.SHOW_PREVIEW = Mainloop.timeout_add(
            timeout,
            Lang.bind(this, function() {
                TIMEOUT_IDS.SHOW_PREVIEW = 0;
                let params = {
                    item_index: 0,
                    no_modal: false,
                    relative_actor: this.actor,
                    side: St.Side.BOTTOM,
                    hide_on_scroll_outside: false
                };
                this._gpaste.show_selected_or_current_contents(params);
            })
        );
    },

    _on_leave: function() {
        this._remove_timeout();
    },

    _remove_timeout: function() {
        if(TIMEOUT_IDS.SHOW_PREVIEW !== 0) {
            Mainloop.source_remove(TIMEOUT_IDS.SHOW_PREVIEW);
            TIMEOUT_IDS.SHOW_PREVIEW = 0;
        }
    },

    _flash_icon: function(style_pseudo_class, icon_name) {
        let color_icon = new St.Icon({
            icon_name: Utils.ICONS.indicator,
            style_class: 'system-status-icon gpaste-system-status-icon',
            opacity: 0,
            visible: true
        });
        color_icon.add_style_pseudo_class(style_pseudo_class);
        this._icons_table.add(color_icon, {
            row: 0,
            col: 0
        });

        if(!icon_name || this._gpaste.is_open) {
            Tweener.addTween(color_icon, {
                time: 0.4,
                transition: 'easeInOutExpo',
                opacity: 255,
                onComplete: Lang.bind(this, function() {
                    Tweener.addTween(color_icon, {
                        time: 0.6,
                        transition: 'easeOutCirc',
                        opacity: 0,
                        onComplete: Lang.bind(this, function() {
                            color_icon.destroy();
                        })
                    });
                })
            });

            return;
        }

        let [indicator_x, indicator_y] = this.actor.get_transformed_position();
        let flash_icon = new St.Icon({
            icon_name: icon_name,
            icon_size: 50,
            style_class: 'system-status-icon gpaste-system-status-icon',
            opacity: 0,
            translation_x: indicator_x,
            translation_y: Main.panel.actor.height
        });
        flash_icon.set_pivot_point(0.5, 0.5);
        flash_icon.add_style_pseudo_class(style_pseudo_class);
        Main.uiGroup.add_child(flash_icon);

        Tweener.removeTweens(flash_icon);
        Tweener.addTween(flash_icon, {
            time: 0.6,
            transition: 'easeInOutExpo',
            opacity: 255,
            onComplete: Lang.bind(this, function() {
                Tweener.addTween(color_icon, {
                    time: 0.4,
                    transition: 'easeInOutExpo',
                    opacity: 255,
                    onComplete: Lang.bind(this, function() {
                        Tweener.addTween(color_icon, {
                            time: 0.6,
                            transition: 'easeOutCirc',
                            opacity: 0,
                            onComplete: Lang.bind(this, function() {
                                color_icon.destroy();
                            })
                        });
                    })
                });
                Tweener.addTween(flash_icon, {
                    time: 0.6,
                    scale_x: 0.5,
                    scale_y: 0.5,
                    translation_y: -30,
                    opacity: 0,
                    onComplete: Lang.bind(this, function() {
                        flash_icon.destroy();
                    })
                })
            })
        });
    },

    _on_pinned_items_changed: function(pinned_items_manager, change_type) {
        if(!Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_COLOR_INDICATION_KEY)) {
            return;
        }

        let style_pseudo_class;

        if(change_type === PinnedItemsManager.CHANGE_TYPE.ADDED) {
            style_pseudo_class = 'pinned';
        }
        else {
            style_pseudo_class = 'unpinned';
        }

        this._flash_icon(style_pseudo_class);
        this._update_menu_items();
    },

    _on_history_changed: function(gpaste_history, change_type) {
        if(!Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_COLOR_INDICATION_KEY)) {
            return;
        }

        let style_pseudo_class, icon_name;

        if(change_type === GPasteHistory.CHANGE_TYPE.ADDED) {
            style_pseudo_class = 'added';
            icon_name = 'bookmark-new-symbolic';
        }
        else if(change_type === GPasteHistory.CHANGE_TYPE.REMOVED) {
            style_pseudo_class = 'removed';
            icon_name = 'user-trash-symbolic';
        }
        else if(change_type === GPasteHistory.CHANGE_TYPE.LIFTED) {
            style_pseudo_class = 'lifted';
            icon_name = 'go-top-symbolic';
        }
        else {
            style_pseudo_class = 'cleared';
            icon_name = '';
        }

        this._flash_icon(style_pseudo_class, icon_name);
    },

    _onEvent: function(actor, event) {
        if(event.type() === Clutter.EventType.KEY_RELEASE) {
            let symbol = event.get_key_symbol()
            let ch = Utils.get_unichar(symbol);
            let number = parseInt(ch);

            if(number > 0 && number <= 9) {
                let index = number - 1;
                PinnedItemsManager.get_manager().activate(index);
                this.menu.close();
            }
            else if(ch) {
                if(!this._new_pinned_item) return Clutter.EVENT_STOP;

                if(this._block_entry_grab_focus) {
                    this._block_entry_grab_focus = false;
                    return Clutter.EVENT_STOP;
                }

                this._new_pinned_item.entry.set_text(ch);
                this._new_pinned_item.entry.grab_key_focus();
            }

            return Clutter.EVENT_STOP;
        }
        else if(event.type() === Clutter.EventType.BUTTON_RELEASE) {
            let button = event.get_button();

            switch(button) {
                case Clutter.BUTTON_SECONDARY:
                    this._remove_timeout();
                    this.menu.toggle();
                    break;
                case Clutter.BUTTON_MIDDLE:
                    break;
                default:
                    this._gpaste.hide_clipboard_preview();
                    this._gpaste.toggle();
                    break;
            }

            return Clutter.EVENT_STOP;
        }
        else {
            return Clutter.EVENT_PROPOGATE;
        }
    },

    _update_menu_items: function() {
        this.menu.removeAll();
        let pinned_items = PinnedItemsManager.get_manager().list_items();

        for (let i in pinned_items) {
            let index = parseInt(i);
            let item = pinned_items[i];
            item = item.replace(/\n/g, ' ');
            item = item.replace(/\s{2,}/g, ' ');
            item = item.substr(0, MAX_PINNED_ITEM_LENGTH);
            item = item.trim();

            let menu_item = new PopupMenu.PopupMenuItem(item);
            Tooltips.get_manager().add_tooltip(menu_item.actor, {
                text: 'Left-click - activate\nRight-click - unpin',
                timeout: 1000
            });

            if(index <= 8) {
                let shortcut_label = new St.Label({
                    style_class: 'gpaste-shortcut-label',
                    text: (index + 1).toString()
                });
                menu_item.actor.insert_child_below(shortcut_label, menu_item.label);
            }

            menu_item.connect('activate',
                Lang.bind(this, function(menu_item, event) {
                    Tooltips.get_manager()._remove_timeout(menu_item.actor);
                    Tooltips.get_manager()._hide_tooltip(menu_item.actor);
                    let type = event.type();
                    let symbol = null;
                    let button = null;

                    if(type === Clutter.EventType.BUTTON_RELEASE) {
                        button = event.get_button();
                    }
                    else if(type === Clutter.EventType.KEY_PRESS) {
                        symbol = event.get_key_symbol();
                    }
                    else {
                        return Clutter.EVENT_PROPOGATE;
                    }

                    if(
                        button === Clutter.BUTTON_PRIMARY
                        || symbol === Clutter.KEY_space
                        || symbol === Clutter.KEY_Return
                    ) {
                        PinnedItemsManager.get_manager().activate(index);
                    }
                    else if(button === Clutter.BUTTON_SECONDARY) {
                        PinnedItemsManager.get_manager().remove(index);
                    }

                    return Clutter.EVENT_PROPOGATE;
                })
            );
            this.menu.addMenuItem(menu_item);
        }


        this._new_pinned_item = new GPasteEntryMenuItem();
        this._new_pinned_item.connect('activate', Lang.bind(this, function(entry_menu_item, text) {
            if(Utils.is_blank(text)) return;
            PinnedItemsManager.get_manager().add(text);
        }));
        this.menu.addMenuItem(this._new_pinned_item);

        let separator = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(separator);

        let track_item = new PopupMenu.PopupSwitchMenuItem("Track changes", true);
        track_item.connect('toggled', Lang.bind(this, function() {
            GPasteClient.get_client().track(track_item.state);
        }));
        GPasteClient.get_client().connect('tracking',
            Lang.bind(this, function(c, state) {
                track_item.setToggleState(state);
            })
        );
        this.menu.addMenuItem(track_item);

        let clear_history_item = new PopupMenu.PopupMenuItem('Clear history');
        clear_history_item.connect('activate', Lang.bind(this, function() {
            GPasteClient.get_client().empty();
        }));
        this.menu.addMenuItem(clear_history_item);

        separator = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(separator);

        let preferences_item = new PopupMenu.PopupMenuItem("Preferences");
        preferences_item.connect("activate", Lang.bind(this, function() {
            Utils.launch_extension_prefs(Me.uuid);
            this._gpaste.hide(false);
        }));
        this.menu.addMenuItem(preferences_item);
    },

    _reposition_progress_bar: function() {
        let [x, y] = this.actor.get_transformed_position();
        let progress_bar_x = Math.round(
            (x + this.actor.width / 2) - (this._gpaste.progress_bar.actor.width / 2)
        );
        let progress_bar_y = Math.round(
            (y + this.actor.height / 2) - (this._gpaste.progress_bar.actor.height / 2)
        );
        this._gpaste.progress_bar.actor.x = progress_bar_x;
        this._gpaste.progress_bar.actor.y = progress_bar_y;
    },

    on_state_changed: function(state) {
        GPasteClient.get_client().on_extension_state_changed(state);
    },

    add_keybindings: function() {
        Main.wm.addKeybinding(
            PrefsKeys.SHOW_CLIPBOARD_CONTENTS_KEY,
            Utils.SETTINGS,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL |
            Shell.ActionMode.MESSAGE_TRAY |
            Shell.ActionMode.OVERVIEW,
            Lang.bind(this, function() {
                this._gpaste.show_selected_or_current_contents({
                    hide_on_scroll_outside: false
                });
            })
        );
        Main.wm.addKeybinding(
            PrefsKeys.QUICK_MODE_KEY,
            Utils.SETTINGS,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL |
            Shell.ActionMode.MESSAGE_TRAY |
            Shell.ActionMode.OVERVIEW,
            Lang.bind(this, function() {
                this._gpaste.quick_mode();
            })
        );
        Main.wm.addKeybinding(
            PrefsKeys.SHOW_PINNED_ITEMS_KEY,
            Utils.SETTINGS,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL |
            Shell.ActionMode.MESSAGE_TRAY |
            Shell.ActionMode.OVERVIEW,
            Lang.bind(this, function() {
                this._block_entry_grab_focus = true;
                this.menu.toggle();
            })
        );
    },

    remove_keybindings: function() {
        Main.wm.removeKeybinding(PrefsKeys.SHOW_CLIPBOARD_CONTENTS_KEY);
        Main.wm.removeKeybinding(PrefsKeys.QUICK_MODE_KEY);
        Main.wm.removeKeybinding(PrefsKeys.SHOW_PINNED_ITEMS_KEY);
    },

    destroy: function() {
        if(SIGNAL_IDS.ENABLE_SHORTCUTS > 0) {
            Utils.SETTINGS.disconnect(SIGNAL_IDS.ENABLE_SHORTCUTS);
        }

        this._remove_timeout();
        this._gpaste.hide_clipboard_preview();
        this.remove_keybindings();
        this._gpaste.destroy();
        PinnedItemsManager.get_manager().destroy();
        this.parent();
    }
});

let gpaste_button = null;

function show_button() {
    if(gpaste_button === null) {
        gpaste_button = new GPasteIntegrationButton();
        gpaste_button.on_state_changed(true);
        Main.panel.addToStatusArea('gpaste_integration', gpaste_button);
    }
}

function hide_button() {
    if(gpaste_button !== null) {
        gpaste_button.destroy();
        gpaste_button = null;
    }
}

function watch_dbus() {
    SIGNAL_IDS.BUS_WATCHER = Gio.bus_watch_name(
        Gio.BusType.SESSION,
        GPasteClient.DBUS_NAME,
        0,
        Lang.bind(this, function() {
            show_button();
        }),
        Lang.bind(this, function() {
            hide_button();
        })
    );
}

function unwatch_dbus() {
    if(SIGNAL_IDS.BUS_WATCHER > 0) {
        Gio.bus_unwatch_name(SIGNAL_IDS.BUS_WATCHER);
        SIGNAL_IDS.BUS_WATCHER = 0;
    }
}

function init(extension) {
    // nothing
}

function enable() {
    watch_dbus();
}

function disable() {
    hide_button();
    unwatch_dbus();
}
