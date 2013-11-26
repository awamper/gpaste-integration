const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Shell = imports.gi.Shell;
const Tweener = imports.ui.tweener;
const Mainloop = imports.mainloop;
const Clutter = imports.gi.Clutter;
const GPaste = imports.gi.GPaste;
const Panel = imports.ui.panel;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const GPasteItemsCounter = Me.imports.gpaste_items_counter;
const GPasteItemsView = Me.imports.gpaste_items_view;
const GPasteItem = Me.imports.gpaste_item;
const GPasteButtons = Me.imports.gpaste_buttons;
const GpasteHistorySwitcher = Me.imports.gpaste_history_switcher;
const StatusBar = Me.imports.status_bar;
const PrefsKeys = Me.imports.prefs_keys;

const ANIMATION_TIME = 0.5;
const CONNECTION_IDS = {
    client_changed: 0,
    client_show_history: 0,
    captured_event: 0
};

const GPasteIntegration = new Lang.Class({
    Name: "GPasteIntegration",

    _init: function() {
        this._client = new GPaste.Client();

        this.actor = new St.BoxLayout({
            reactive: true,
            track_hover:true,
            can_focus: true
        });
        this.actor.connect(
            'key-press-event',
            Lang.bind(this, this._on_key_press_event)
        );
        this.actor.connect(
            'key-release-event',
            Lang.bind(this, this._on_key_release_event)
        );
        Main.layoutManager.panelBox.add_actor(this.actor);
        this.actor.lower_bottom();

        this._status_label = new St.Label({
            style_class: 'gpaste-items-view-status-label',
            text: 'Empty',
            visible: false
        });
        this._table = new St.Table({
            style_class: 'gpaste-box',
            homogeneous: false
        });
        this.actor.add_actor(this._table);

        this._history_switcher =
            new GpasteHistorySwitcher.GpasteHistorySwitcher(this);
        this._statusbar = new StatusBar.StatusBar();
        this._init_search_entry();
        this._items_view = new GPasteItemsView.GPasteItemsView(this._statusbar);
        this._items_view.connect(
            "item-clicked",
            Lang.bind(this, this._on_item_clicked)
        );
        this._items_view.connect(
            "displayed-items-changed",
            Lang.bind(this, this._on_items_changed)
        );
        this._items_counter = new GPasteItemsCounter.GPasteItemsCounter(
            this._items_view
        );
        this._buttons = new GPasteButtons.GPasteButtons(this);

        this._table.add(this._search_entry, {
            row: 0,
            col: 0,
            col_span: 3,
            x_fill: true,
            x_expand: true,
            y_fill: false,
            y_expand: false,
            y_align: St.Align.START,
            x_align: St.Align.START
        });
        this._table.add(this._items_view.actor, {
            row: 1,
            col: 0,
            col_span: 3,
            x_fill: true,
            y_fill: true,
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE
        });
        this._table.add(this._status_label, {
            row: 1,
            col: 0,
            col_span: 3,
            x_expand: true,
            y_expand: true,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE
        });
        this._table.add(this._buttons.actor, {
            row: 2,
            col: 2,
            x_fill: false,
            x_expand: false,
            y_fill: false,
            y_expand: false,
            y_align: St.Align.MIDDLE,
            x_align: St.Align.END
        });
        this._table.add(this._items_counter.actor, {
            row: 2,
            col: 0,
            x_fill: false,
            x_expand: false,
            y_fill: false,
            y_expand: false,
            y_align: St.Align.MIDDLE,
            x_align: St.Align.START
        });
        this._table.add(this._statusbar.actor, {
            row: 2,
            col: 1,
            x_fill: false,
            x_expand: false,
            y_fill: false,
            y_expand: false,
            y_align: St.Align.MIDDLE,
            x_align: St.Align.END
        });

        this._open = false;
        this._last_selected_item_id = null;
        this._resize();
        this._update_history();

        CONNECTION_IDS.client_show_history =
            this._client.connect('show-history', Lang.bind(this, this.toggle));
        CONNECTION_IDS.client_changed = this._client.connect('changed',
            Lang.bind(this, function() {
                this._items_view.set_display_mode(
                    GPasteItemsView.ViewMode.TEXT
                );
                this._update_history();

                if(this.is_open) {
                    this._items_view.show_all();

                    if(this._last_selected_item_id !== null) {
                        let item = this._items_view.items[
                            this._last_selected_item_id
                        ];
                        this._items_view.select(item.actor);
                        this._last_selected_item_id = null;
                    }
                    else {
                        this._items_view.select_first_visible();
                    }
                }
            })
        );
    },

    _on_captured_event: function(object, event) {
        if(event.type() !== Clutter.EventType.BUTTON_PRESS) return;

        let [x, y, mods] = global.get_pointer();

        if(x < this.actor.x || y > (this.actor.y + this.actor.height)) {
            this.hide();
        }
    },

    _connect_captured_event: function() {
        CONNECTION_IDS.captured_event = global.stage.connect(
            'captured-event',
            Lang.bind(this, this._on_captured_event)
        );
    },

    _disconnect_captured_event: function() {
        if(CONNECTION_IDS.captured_event > 0) {
            global.stage.disconnect(CONNECTION_IDS.captured_event);
        }
    },

    _on_item_clicked: function(object, button, item) {
        switch(button) {
            case Clutter.BUTTON_SECONDARY:
                this.delete_item(item);
                break;
            case Clutter.BUTTON_MIDDLE:
                break;
            default:
                this.activate_item(item);
                break;
        }
    },

    _on_items_changed: function() {
        if(this._items_view.displayed_length > 0) {
            this._status_label.hide();
        }
        else {
            this._status_label.show();
        }
    },

    _init_search_entry: function() {
        this._search_entry = new St.Entry({
            style_class: "gpaste-search-entry",
            hint_text: "Type to search",
            track_hover: true,
            can_focus: true
        });
        this._search_entry.connect('key-press-event',
            Lang.bind(this, this._on_search_key_press_event)
        );
        this._search_entry.clutter_text.connect('text-changed',
            Lang.bind(this, this._on_search_text_changed)
        );
        this._inactive_icon = new St.Icon({
            style_class: 'gpaste-search-entry-icon',
            icon_name: 'edit-find-symbolic',
            reactive: false
        });
        this._active_icon = new St.Icon({
            style_class: 'gpaste-search-entry-icon',
            icon_name: 'edit-clear-symbolic',
            reactive: true
        });
        this._search_entry.set_secondary_icon(this._inactive_icon);
        this._search_entry.connect('secondary-icon-clicked',
            Lang.bind(this, function() {
                this._search_entry.set_text('');
            })
        );
    },

    _update_history: function() {
        let history = this._client.get_history();

        if(history === null) {
            Main.notify("GpasteIntegration: Couldn't connect to GPaste daemon");
            this.history = [];
        }
        else if(history.length < 1) {
            this.history = [];
        }
        else {
            this.history = history;
        }
    },

    _on_key_press_event: function(o, e) {
        let symbol = e.get_key_symbol()
        let ch = Utils.get_unichar(symbol);
        let selected_count = this._items_view.get_selected().length;

        if(symbol === Clutter.KEY_Control_L || symbol === Clutter.KEY_Control_R) {
            this._items_view.show_shortcuts();
            return false;
        }
        else if(e.has_control_modifier()) {
            let unichar = Utils.get_unichar(symbol);
            let number = parseInt(unichar);
            
            if(number !== NaN && number >= 1 && number <= 9) {
                this._activate_by_shortcut(number);
            }

            return false;
        }
        else if(symbol === Clutter.Escape) {
            this.hide();
            return true;
        }
        else if(symbol === Clutter.Up) {
            if(selected_count > 0) {
                this._items_view.select_previous();
            }
            else {
                this._items_view.select_first_visible();
            }

            return true;
        }
        else if(symbol === Clutter.Down) {
            if(selected_count > 0) {
                this._items_view.select_next();
            }
            else {
                this._items_view.select_first_visible();
            }

            return true;
        }
        else if(ch) {
            this._search_entry.set_text(ch);
            this._search_entry.grab_key_focus();
            return true;
        }
        else {
            return false;
        }
    },

    _on_key_release_event: function(o, e) {
        let symbol = e.get_key_symbol()

        if(symbol === Clutter.KEY_Control_L || symbol === Clutter.KEY_Control_R) {
            this._items_view.hide_shortcuts();

            return true;
        }
        else if(symbol == Clutter.Return || symbol == Clutter.KP_Enter) {
            let selected = this._items_view.get_selected();

            if(selected.length === 1) {
                this.activate_item(selected[0]);
            }

            return true;
        }
        else if(symbol == Clutter.Delete) {
            let selected = this._items_view.get_selected();

            if(selected.length === 1) {
                this.delete_item(selected[0]);
            }

            return true;
        }
        else {
            return false;
        }
    },

    _is_empty_entry: function(entry) {
        if(Utils.is_blank(entry.text) || entry.text === entry.hint_text) {
            return true
        }
        else {
            return false;
        }
    },

    _on_search_key_press_event: function(o, e) {
        let symbol = e.get_key_symbol();
        let ctrl = (e.get_state() & Clutter.ModifierType.CONTROL_MASK)

        if(symbol === Clutter.Escape) {
            if(ctrl) {
                this.hide();
            }
            else {
                this._search_entry.set_text('');
                this.actor.grab_key_focus();
            }

            return true;
        }

        return false;
    },

    _on_search_text_changed: function() {
        if(!this._is_empty_entry(this._search_entry)) {
            this._search_entry.set_secondary_icon(this._active_icon);
            this._items_view.filter(this._search_entry.text);
        }
        else {
            if(this._search_entry.text === this._search_entry.hint_text) return;

            this.actor.grab_key_focus();
            this._search_entry.set_secondary_icon(this._inactive_icon);
            this._items_view.set_display_mode(GPasteItemsView.ViewMode.TEXT);
            this._items_view.show_all();
        }
    },

    _resize: function() {
        let message_id = this._statusbar.add_message(
            'Test1234!',
            0,
            StatusBar.MESSAGE_TYPES.info,
            true
        );
        let width_percents = Utils.SETTINGS.get_int(
            PrefsKeys.WIDTH_PERCENTS_KEY
        );
        let height_percents = Utils.SETTINGS.get_int(
            PrefsKeys.HEIGHT_PERCENTS_KEY
        );
        let primary = Main.layoutManager.primaryMonitor;
        let available_height = primary.height - Main.panel.actor.height;
        let my_width = primary.width / 100 * width_percents;
        let my_height = available_height / 100 * height_percents;

        this.actor.x = primary.width - my_width;
        this._hidden_y = this.actor.get_parent().height - my_height;
        this._target_y = this._hidden_y + my_height;

        this.actor.y = this._hidden_y;
        this.actor.width = my_width;
        this.actor.height = my_height;

        this._table.width = my_width;
        this._table.height = my_height;
        this._statusbar.remove_message(message_id);
    },

    _disconnect_all: function() {
        this._client.disconnect(CONNECTION_IDS.client_changed);
        this._client.disconnect(CONNECTION_IDS.client_show_history);
        this._disconnect_captured_event();
    },

    _activate_by_shortcut: function(shortcut) {
        for(let i = 0; i < this._items_view.displayed_length; i++) {
            let item = this._items_view.displayed_items[i];

            if(item.shortcut === shortcut) {
                this.activate_item(item);
                break;
            }
        }
    },

    activate_item: function(item) {
        [x, y] = item.actor.get_transformed_position();
        let clone = new Clutter.Clone({
            source: item.actor,
            width: item.actor.width,
            height: item.actor.height,
            x: x,
            y: y
        });
        Main.uiGroup.add_child(clone);
        this.hide(false);

        Tweener.addTween(clone, {
            time: 1,
            opacity: 0,
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                clone.destroy();
                this._client.select(item.id);
                this._search_entry.set_text('')
            })
        });
    },

    delete_item: function(item) {
        if(this._items_view.length === 1) {
            this._client.empty();
            this.hide();
            return;
        }

        let id = item.id;
        let total_items = this._items_view.length;
        this._items_view.remove_item(item, Lang.bind(this, function() {
            if(this._items_view.length > 1) {
                if(total_items === id + 1) {
                    this._last_selected_item_id = id - 1;
                }
                else {
                    this._last_selected_item_id = id;
                }
            }
            else {
                this._last_selected_item_id = null;
            }

            this._client.delete(id);
        }));
    },

    show: function(animation, target) {
        if(this._open) return;

        animation = animation === undefined ? true : animation;
        let push_result = Main.pushModal(this.actor, {
            keybindingMode: Shell.KeyBindingMode.NORMAL
        });

        if(!push_result) return;

        this._open = true;
        this.actor.show();
        this._resize();
        this._items_view.show_all();
        target = target === undefined ? this._target_y : target;

        if(animation) {
            Tweener.removeTweens(this.actor);
            Tweener.addTween(this.actor, {
                time: ANIMATION_TIME / St.get_slow_down_factor(),
                transition: 'easeOutQuad',
                y: target
            });
        }
        else {
            this.actor.y = target;
        }

        if(!this._is_empty_entry(this._search_entry)) {
            this._search_entry.clutter_text.set_selection(
                0,
                this._search_entry.text.length
            );
            this._items_view.filter(this._search_entry.text);
            this._search_entry.grab_key_focus();
        }

        this._connect_captured_event();
        this._items_view.actor.vscroll.adjustment.value = 0;
        this._items_view.select_first();
    },

    hide: function(animation, target) {
        if(!this._open) return;

        Main.popModal(this.actor);
        this._open = false;
        this._disconnect_captured_event();
        this._items_view.unselect_all();
        this._history_switcher.hide();
        animation = animation === undefined ? true : animation;

        if(animation) {
            Tweener.removeTweens(this.actor);
            Tweener.addTween(this.actor, {
                time: ANIMATION_TIME / St.get_slow_down_factor(),
                transition: 'easeOutQuad',
                y: this._hidden_y,
                onComplete: Lang.bind(this, function() {
                    this.actor.hide();
                })
            });
        }
        else {
            this.actor.hide();
            this.actor.y = this._hidden_y;
        }
    },

    toggle: function() {
        if(this._open) {
            this.hide();
        }
        else {
            this.show();
        }
    },

    destroy: function() {
        this._disconnect_all();
        this._history_switcher.destroy();
        this.actor.destroy();
    },

    get is_open() {
        return this._open;
    },

    get history() {
        return this._history;
    },

    set history(arr) {
        this._history = [];
        let items = [];

        for(let i = 0; i < arr.length; i++) {
            let item_data = {
                id: i,
                text: arr[i],
                markup: false
            };
            items.push(new GPasteItem.GPasteItem(item_data));
            this._history.push(item_data);
        }

        this._items_view.clear();
        this._items_view.set_items(items);
    },

    get client() {
        return this._client;
    },

    get history_switcher() {
        return this._history_switcher;
    }
});
