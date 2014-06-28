const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Shell = imports.gi.Shell;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Tweener = imports.ui.tweener;
const Mainloop = imports.mainloop;
const Clutter = imports.gi.Clutter;
const Panel = imports.ui.panel;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const ListView = Me.imports.list_view;
const GPasteListView = Me.imports.gpaste_list_view;
const GPasteListViewRenderer = Me.imports.gpaste_list_view_renderer;
const GPasteButtons = Me.imports.gpaste_buttons;
const GpasteHistorySwitcher = Me.imports.gpaste_history_switcher;
const StatusBar = Me.imports.status_bar;
const PrefsKeys = Me.imports.prefs_keys;
const Fuzzy = Me.imports.fuzzy;
const ContentsPreviewDialog = Me.imports.contents_preview_dialog;
const GPasteClient = Me.imports.gpaste_client;

const FILTER_TIMEOUT_MS = 200;

const CONNECTION_IDS = {
    client_changed: 0,
    client_show_history: 0,
    captured_event: 0
};

const TIMEOUT_IDS = {
    FILTER: 0
};

const SEARCH_FLAGS = {
    ONLY_TEXT: '-t',
    ONLY_FILES: '-f'
};

const GPasteIntegration = new Lang.Class({
    Name: "GPasteIntegration",

    _init: function() {
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
        Main.uiGroup.add_actor(this.actor);
        Main.uiGroup.set_child_below_sibling(
            this.actor,
            Main.layoutManager.panelBox
        );

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
        
        this._list_model = new ListView.Model();
        this._list_model.set_validator(Lang.bind(this, function(item) {
            return !Utils.is_blank(item.text);
        }));
        this._list_model.connect(
            "changed::items",
            Lang.bind(this, this._on_items_changed)
        );

        this._list_view = new GPasteListView.GPasteListView({
            scrollview_style: 'gpaste-list-view-scrollbox',
            box_style: 'gpaste-list-view-box',
            shortcut_style: 'gpaste-shortcut-label'
        });
        this._list_view.set_model(this._list_model);
        this._list_view.set_renderer(
            GPasteListViewRenderer.GPasteListViewRenderer
        );
        this._list_view.connect(
            "clicked",
            Lang.bind(this, this._on_item_clicked)
        );

        this._items_counter = new ListView.ItemsCounter(this._list_model);
        this._buttons = new GPasteButtons.GPasteButtons(this);
        this._contents_preview_dialog =
            new ContentsPreviewDialog.ContentsPreviewDialog()

        let fuzzy_options = {
            pre: GPasteListViewRenderer.HIGHLIGHT_MARKUP.START,
            post: GPasteListViewRenderer.HIGHLIGHT_MARKUP.STOP,
            extract: function(arg) { return arg.text; },
            escape: true,
            max_distance: 30
        }
        this._fuzzy_search = new Fuzzy.Fuzzy(fuzzy_options);

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
        this._table.add(this._list_view.actor, {
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

        CONNECTION_IDS.client_show_history = GPasteClient.get_client().connect(
            'show-history',
            Lang.bind(this, this.toggle)
        );
        CONNECTION_IDS.client_changed = GPasteClient.get_client().connect(
            'changed',
            Lang.bind(this, function() {
                this._update_history(
                    Lang.bind(this, function() {
                        if(this.is_open) {
                            this._show_all();

                            if(this._last_selected_item_id !== null) {
                                let display = this._list_view.get_display_for_index(
                                    this._last_selected_item_id
                                );

                                if(display) {
                                    this._list_view.select(display);
                                    this._last_selected_item_id = null;
                                }
                                else {
                                    this._list_view.select_first_visible();
                                }
                            }
                            else {
                                this._list_view.select_first_visible();
                            }
                        }
                    })
                );
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

    _on_item_clicked: function(object, button, display, model, index) {
        switch(button) {
            case Clutter.BUTTON_SECONDARY:
                this.delete_item(model, index);
                break;
            case Clutter.BUTTON_MIDDLE:
                break;
            default:
                this.activate_item(model, index);
                break;
        }
    },

    _on_items_changed: function() {
        if(this._list_model.length > 0) {
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

    _update_history: function(on_complete) {
        GPasteClient.get_client().get_history(
            Lang.bind(this, function(history) {
                if(!history) {
                    Main.notify(
                        "GpasteIntegration: Couldn't connect to GPaste daemon"
                    );
                    this.history = [];
                }
                else if(history.length < 1) {
                    this.history = [];
                }
                else {
                    this.history = history;
                }

                if(typeof on_complete === 'function') on_complete();
            })
        );
    },

    _on_key_press_event: function(o, e) {
        let symbol = e.get_key_symbol()
        let ch = Utils.get_unichar(symbol);

        if(symbol === Clutter.KEY_Control_L || symbol === Clutter.KEY_Control_R) {
            this._list_view.show_shortcuts();
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
            let selected_index = this._list_view.get_selected_index();

            if(selected_index !== -1) {
                this._list_view.select_previous();
            }
            else {
                this._list_view.select_first_visible();
            }

            return true;
        }
        else if(symbol === Clutter.Down) {
            let selected_index = this._list_view.get_selected_index();

            if(selected_index !== -1) {
                this._list_view.select_next();
            }
            else {
                this._list_view.select_first_visible();
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
            this._list_view.hide_shortcuts();

            return true;
        }
        else if(symbol == Clutter.Return || symbol == Clutter.KP_Enter) {
            let selected_index = this._list_view.get_selected_index();

            if(selected_index !== -1) {
                this.activate_item(this._list_model, selected_index);
            }

            return true;
        }
        else if(symbol == Clutter.Delete) {
            let selected_index = this._list_view.get_selected_index();

            if(selected_index !== -1) {
                this.delete_item(this._list_model, selected_index);
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
        if(TIMEOUT_IDS.FILTER !== 0) {
            Mainloop.source_remove(TIMEOUT_IDS.FILTER);
            TIMEOUT_IDS.FILTER = 0;
        }

        if(!this._is_empty_entry(this._search_entry)) {
            let parsed_search = this._parse_search_entry();
            this._search_entry.set_secondary_icon(this._active_icon);
            TIMEOUT_IDS.FILTER = Mainloop.timeout_add(FILTER_TIMEOUT_MS,
                Lang.bind(this, this._filter, parsed_search.term, parsed_search.flag)
            );
        }
        else {
            if(this._search_entry.text === this._search_entry.hint_text) return;

            // this.actor.grab_key_focus();
            this._search_entry.set_secondary_icon(this._inactive_icon);
            this._show_all();
        }
    },

    _parse_search_entry: function() {
        let text = this._search_entry.text;
        let result = {
            term: '',
            flag: ''
        };
        if(this._is_empty_entry(this._search_entry)) return result;

        if(Utils.ends_with(text, SEARCH_FLAGS.ONLY_FILES)) {
            result.term = text.slice(0, -SEARCH_FLAGS.ONLY_FILES.length);
            result.flag = SEARCH_FLAGS.ONLY_FILES;
        }
        else if(Utils.ends_with(text, SEARCH_FLAGS.ONLY_TEXT)) {
            result.term = text.slice(0, -SEARCH_FLAGS.ONLY_TEXT.length);
            result.flag = SEARCH_FLAGS.ONLY_TEXT;
        }
        else {
            result.term = text;
            result.flag = '';
        }

        return result;
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

        let monitor = Main.layoutManager.currentMonitor;
        let is_primary = monitor.index === Main.layoutManager.primaryIndex;

        let available_height = monitor.height;
        if(is_primary) available_height -= Main.panel.actor.height;

        let my_width = monitor.width / 100 * width_percents;
        let my_height = available_height / 100 * height_percents;

        this._hidden_y = monitor.y - my_height;
        this._target_y = this._hidden_y + my_height;
        if(is_primary) this._target_y += Main.panel.actor.height;

        this.actor.x = (monitor.width + monitor.x) - my_width;
        this.actor.y = this._hidden_y;
        this.actor.width = my_width;
        this.actor.height = my_height;

        this._table.width = my_width;
        this._table.height = my_height;
        this._statusbar.remove_message(message_id);
    },

    _disconnect_all: function() {
        GPasteClient.get_client().disconnect(CONNECTION_IDS.client_changed);
        GPasteClient.get_client().disconnect(CONNECTION_IDS.client_show_history);
        this._disconnect_captured_event();
    },

    _activate_by_shortcut: function(number) {
        let index = this._list_view.get_index_for_shortcut(number);
        if(index === -1) return;
        this.activate_item(this._list_model, index);
    },

    _show_items: function(items) {
        this._list_model.set_items(items);
        this._list_view.select_first_visible();
    },

    _filter: function(term, flag) {
        function is_file_item(item) {
            return (
                Utils.starts_with(item.text, '[Files]')
                || Utils.starts_with(item.text, '[Image')
            );
        }

        this._fuzzy_search.filter(term, this.history,
            Lang.bind(this, function(matches) {
                let items = [];

                for(let i = 0; i < matches.length; i++) {
                    let item = Object.create(matches[i].original);

                    if(flag === SEARCH_FLAGS.ONLY_FILES) if(!is_file_item(item)) continue;
                    if(flag === SEARCH_FLAGS.ONLY_TEXT) if(is_file_item(item)) continue;

                    item.markup = matches[i].string;
                    items.push(item);
                }

                this._show_items(items);
                this._list_view.reset_scroll();
                this._list_view.select_first();
            })
        );
    },

    _show_all: function() {
        this._show_items(this.history);
        this._list_view.reset_scroll();
        this._list_view.select_first();
    },

    activate_item: function(model, index) {
        GPasteClient.get_client().select(model.get(index).id);
        let display = this._list_view.get_display_for_index(index);
        this.hide(false);

        if(display) this._list_view.fade_out_display(display);

        this._search_entry.set_text('');
    },

    delete_item: function(model, index) {
        if(model.length <= 1) {
            GPasteClient.get_client().empty();
            this._last_selected_item_id = null;
            this.hide();
            return;
        }

        let deleted_id = model.get(index).id;
        model.delete(index);

        if(model.length === deleted_id) {
            this._last_selected_item_id = deleted_id - 1;
        }
        else {
            this._last_selected_item_id = deleted_id;
        }

        GPasteClient.get_client().delete_sync(deleted_id);
    },

    show: function(animation, target) {
        if(this._open) return;

        animation =
            animation === undefined
            ? Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY)
            : animation;
        let push_result = Main.pushModal(this.actor, {
            keybindingMode: Shell.KeyBindingMode.NORMAL
        });

        if(!push_result) return;

        this._open = true;
        this.actor.show();
        this._resize();
        this._show_all();
        target = target === undefined ? this._target_y : target;

        if(animation) {
            let time = Utils.SETTINGS.get_double(PrefsKeys.OPEN_ANIMATION_TIME_KEY);
            Tweener.removeTweens(this.actor);
            Tweener.addTween(this.actor, {
                time: time / St.get_slow_down_factor(),
                transition: Utils.SETTINGS.get_string(PrefsKeys.OPEN_TRANSITION_TYPE_KEY),
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
            this._filter(this._search_entry.text);
            this._search_entry.grab_key_focus();
        }

        this._connect_captured_event();
        this._list_view.reset_scroll();
        this._list_view.select_first();
    },

    hide: function(animation, target) {
        if(!this._open) return;

        Main.popModal(this.actor);
        this._open = false;
        this._disconnect_captured_event();
        this._list_view.unselect_all();
        this._list_view.hide_shortcuts();
        this._history_switcher.hide();
        animation =
            animation === undefined
            ? Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY)
            : animation;

        if(animation) {
            let time = Utils.SETTINGS.get_double(PrefsKeys.CLOSE_ANIMATION_TIME_KEY);
            Tweener.removeTweens(this.actor);
            Tweener.addTween(this.actor, {
                time: time / St.get_slow_down_factor(),
                transition: Utils.SETTINGS.get_string(PrefsKeys.CLOSE_TRANSITION_TYPE_KEY),
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

    show_current_contents: function() {
        if(this._contents_preview_dialog.shown) return;

        GPasteClient.get_client().get_raw_element(0,
            Lang.bind(this, function(contents) {
                if(!contents) return;
                this._contents_preview_dialog.preview(0, contents);
            })
        );
    },

    destroy: function() {
        this._disconnect_all();
        this._buttons.destroy();
        this._statusbar.destroy();
        this._list_view.destroy();
        this._items_counter.destroy();
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

        for(let i = 1; i < arr.length; i++) {
            let item_data = {
                id: i,
                text: arr[i],
                markup: false
            };
            this._history.push(item_data);
        }
    },

    get history_switcher() {
        return this._history_switcher;
    }
});
