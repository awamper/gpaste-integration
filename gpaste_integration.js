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
const Signals = imports.signals;
const Params = imports.misc.params;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const ListView = Me.imports.list_view;
const GPasteListView = Me.imports.gpaste_list_view;
const GPasteListViewRenderer = Me.imports.gpaste_list_view_renderer;
const GPasteButtons = Me.imports.gpaste_buttons;
const GpasteHistorySwitcher = Me.imports.gpaste_history_switcher;
const PrefsKeys = Me.imports.prefs_keys;
const Fuzzy = Me.imports.fuzzy;
const ContentsPreviewDialog = Me.imports.contents_preview_dialog;
const GPasteClient = Me.imports.gpaste_client;
const GPasteHistory = Me.imports.gpaste_history;
const GPasteHistoryItem = Me.imports.gpaste_history_item;
const GPasteSearchEntry = Me.imports.gpaste_search_entry;
const GPasteMergePanel = Me.imports.gpaste_merge_panel;
const PinnedItemsManager = Me.imports.pinned_items_manager;
const Constants = Me.imports.constants;
const ImgurUploader = Me.imports.imgur_uploader;
const FpasteUploader = Me.imports.fpaste_uploader;
const GPasteProgressBar = Me.imports.progress_bar;

const FILTER_TIMEOUT_MS = 200;

const CONNECTION_IDS = {
    history_changed: 0,
    history_name_changed: 0,
    client_show_history: 0,
    captured_event: 0,
    item_info_mode: 0,
    image_preview: 0,
    show_indexes: 0
};

const TIMEOUT_IDS = {
    FILTER: 0,
    INFO: 0,
    QUICK_MODE_SHORTCUTS: 0,
    NEW_ITEM_TIMEOUT: 0,
    TRACK_MOUSE: 0
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

        this._history = new GPasteHistory.GPasteHistory();
        CONNECTION_IDS.history_changed =
            this._history.connect(
                'changed',
                Lang.bind(this, this._on_history_changed)
            );
        CONNECTION_IDS.history_name_changed =
            this._history.connect(
                'history-name-changed',
                Lang.bind(this, function() {
                    this._history_name_changed_trigger = true;
                })
            );

        this._history_switcher =
            new GpasteHistorySwitcher.GpasteHistorySwitcher(this);

        this._search_entry = new GPasteSearchEntry.GPasteSearchEntry();
        this._search_entry.connect('key-press-event',
            Lang.bind(this, this._on_search_key_press_event)
        );
        this._search_entry.clutter_text.connect('text-changed',
            Lang.bind(this, this._on_search_text_changed)
        );

        this._list_model = new ListView.Model();
        this._list_model.set_validator(
            Lang.bind(this, function(history_item) {
                return !Utils.is_blank(history_item.text);
            })
        );
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
        this._list_view.connect(
            'selected',
            Lang.bind(this, this._on_item_selected)
        );
        this._list_view.connect(
            'unselected',
            Lang.bind(this, this._on_item_unselected)
        );
        this._list_view.connect(
            'long-press',
            Lang.bind(this, function(list_view, button, display, model, index) {
                let history_item = model.get(index);
                this._alt_activate_selected(history_item);
            })
        );
        this._list_view.connect(
            'toggled',
            Lang.bind(this, this._on_item_toggled)
        );
        this._list_view.connect(
            'upload-item',
            Lang.bind(this, function() {
                this._upload_selected_item();
            })
        );
        this._list_view.connect(
            'delete-request',
            Lang.bind(this, function(list_view, model, index) {
                this.delete_item(model, index);
            })
        );

        this._merge_panel = new GPasteMergePanel.GPasteMergePanel();
        this._merge_panel.button.connect(
            'clicked',
            Lang.bind(this, this._merge_checked_items)
        );
        this._merge_panel.reset_button.connect(
            'clicked',
            Lang.bind(this, function() {
                this.reset_selection();

                if(this._search_entry.flag === GPasteSearchEntry.SEARCH_FLAGS.ONLY_CHECKED) {
                    this._search_entry.clear();
                    this.actor.grab_key_focus();
                }
            })
        );
        this._merge_panel.delete_button.connect(
            'clicked',
            Lang.bind(this, function() {
                this._delete_checked_items();
            })
        );
        this._items_counter = new ListView.ItemsCounter(this._list_model);
        this._buttons = new GPasteButtons.GPasteButtons(this);
        this._contents_preview_dialog =
            new ContentsPreviewDialog.ContentsPreviewDialog(this);

        this._imgur_uploader = new ImgurUploader.ImgurUploader();
        this._imgur_uploader.connect('error', Lang.bind(this, this._on_imgur_error));
        this._imgur_uploader.connect('progress', Lang.bind(this, this._on_imgur_progress));
        this._imgur_uploader.connect('done', Lang.bind(this, this._on_imgur_done));

        this._fpaste_uploader = new FpasteUploader.FpasteUploader();
        this._fpaste_uploader.connect('error', Lang.bind(this, this._on_fpaste_error));
        this._fpaste_uploader.connect('done', Lang.bind(this, this._on_fpaste_done));

        this._panel_progress_bar = new GPasteProgressBar.GPasteProgressBar({
            box_style_class: 'gpaste-progress-bar-panel-box',
            progress_style_class: 'gpaste-progress-bar-panel',
            x_fill: false,
            y_fill: false,
            expand: false
        });
        this._panel_progress_bar.hide();
        Main.uiGroup.add_child(this._panel_progress_bar.actor);

        let fuzzy_options = {
            pre: GPasteListViewRenderer.HIGHLIGHT_MARKUP.START,
            post: GPasteListViewRenderer.HIGHLIGHT_MARKUP.STOP,
            extract: function(history_item) {
                let text = history_item.text;
                if(Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_COLOR_MARKS_KEY)) {
                    text = history_item.text_without_type;
                }

                return text;
            },
            escape: true,
            max_distance: 30
        }
        this._fuzzy_search = new Fuzzy.Fuzzy(fuzzy_options);

        this._table.add(this._search_entry, {
            row: 0,
            col: 0,
            col_span: 2,
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
            col_span: 2,
            x_fill: true,
            y_fill: true,
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE
        });
        this._table.add(this._status_label, {
            row: 1,
            col: 0,
            col_span: 2,
            x_expand: true,
            y_expand: true,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE
        });
        this._table.add(this._buttons.actor, {
            row: 2,
            col: 1,
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
        this._table.add(this._merge_panel.actor, {
            row: 2,
            col: 0,
            col_span: 2,
            x_fill: true,
            x_expand: true,
            y_fill: false,
            y_expand: false,
            y_align: St.Align.MIDDLE,
            x_align: St.Align.START
        });

        this._open = false;
        this._history_changed_trigger = true;
        this._history_name_changed_trigger = false;
        this._last_selected_item_index = null;
        this._activate_animation_running = false;
        this._quick_mode = false;
        this._merge_queue_hashes = [];
        this.force_update = false;
        this._resize();

        CONNECTION_IDS.client_show_history =
            GPasteClient.get_client().connect(
                'show-history',
                Lang.bind(this, this.toggle)
            );
        CONNECTION_IDS.item_info_mode =
            Utils.SETTINGS.connect(
                'changed::' + PrefsKeys.ITEM_INFO_MODE_KEY,
                Lang.bind(this, function() {
                    this._history_changed_trigger = true;
                })
            );
        CONNECTION_IDS.image_preview =
            Utils.SETTINGS.connect(
                'changed::' + PrefsKeys.ENABLE_IMAGE_PREVIEW_KEY,
                Lang.bind(this, function() {
                    this._history_changed_trigger = true;
                })
            );
        CONNECTION_IDS.show_indexes =
            Utils.SETTINGS.connect(
                'changed::' + PrefsKeys.SHOW_INDEXES_KEY,
                Lang.bind(this, function() {
                    this._history_changed_trigger = true;
                })
            );
    },

    _on_history_changed: function(history, change_type) {
        if(TIMEOUT_IDS.NEW_ITEM_TIMEOUT) {
            Mainloop.source_remove(TIMEOUT_IDS.NEW_ITEM_TIMEOUT);
            TIMEOUT_IDS.NEW_ITEM_TIMEOUT = 0;
        }

        this._merge_queue_hashes = [];
        this._history_changed_trigger = true;
        this._contents_preview_dialog.hide(false);

        if(this.is_open) {
            if(this._history_name_changed_trigger) {
                this._history_name_changed_trigger = false;
                this.show_all();
            }
            if(this.force_update) {
                this.force_update = false;
                this.show_all();
            }

            if(this._last_selected_item_index === null) {
                this._list_view.select_first_visible();
                return;
            }

            let display = this._list_view.get_display(
                this._last_selected_item_index
            );

            if(display) {
                this._list_view.select(display);
                this._last_selected_item_index = null;
            }
            else {
                this._list_view.select_first_visible();
            }
        }
        else {
            let proceed =
                Utils.SETTINGS.get_boolean(PrefsKeys.PREVIEW_CLIPBOARD_ON_CHANGE_KEY) &&
                !this._activate_animation_running;
            if(!proceed) return;

            this.show_selected_or_current_contents({no_modal: true});

            TIMEOUT_IDS.TRACK_MOUSE = Mainloop.timeout_add(150,
                Lang.bind(this, function() {
                    if(Utils.is_pointer_inside_actor(this._contents_preview_dialog.actor)) {
                        TIMEOUT_IDS.TRACK_MOUSE = 0;
                        this.hide_clipboard_preview();
                        return GLib.SOURCE_REMOVE;
                    }

                    return GLib.SOURCE_CONTINUE;
                })
            );
            TIMEOUT_IDS.NEW_ITEM_TIMEOUT = Mainloop.timeout_add(
                Utils.SETTINGS.get_int(PrefsKeys.PREVIEW_CLIPBOARD_ON_CHANGE_TIMEOUT_KEY),
                Lang.bind(this, function() {
                    TIMEOUT_IDS.NEW_ITEM_TIMEOUT = 0;
                    this.hide_clipboard_preview();

                    if(TIMEOUT_IDS.TRACK_MOUSE !== 0) {
                        Mainloop.source_remove(TIMEOUT_IDS.TRACK_MOUSE);
                        TIMEOUT_IDS.TRACK_MOUSE = 0;
                    }
                })
            );
        }
    },

    _on_captured_event: function(object, event) {
        if(
            event.type() === Clutter.EventType.BUTTON_PRESS &&
            !Utils.is_pointer_inside_actor(this.actor) &&
            !Utils.is_pointer_inside_actor(Main.panel.actor)
        ) {
            if(
                this._contents_preview_dialog.shown &&
                Utils.is_pointer_inside_actor(this._contents_preview_dialog.actor)
            ) {
                return;
            }

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
            CONNECTION_IDS.captured_event = 0;
        }
    },

    _on_item_clicked: function(object, button, display, model, index) {
        let history_item = this._list_model.get(index);
        if(history_item.inactive) return;

        switch(button) {
            case Clutter.BUTTON_SECONDARY:
                this._list_view.toggle_check(index);
                break;
            case Clutter.BUTTON_MIDDLE:
                break;
            default:
                this.activate_item(model, index);
                break;
        }
    },

    _on_item_selected: function(object, display) {
        if(
            Utils.SETTINGS.get_boolean(PrefsKeys.PREVIEW_ITEM_ON_HOVER_KEY) &&
            !this._quick_mode
        ) {
            TIMEOUT_IDS.INFO = Mainloop.timeout_add(
                Utils.SETTINGS.get_int(PrefsKeys.PREVIEW_ON_HOVER_TIMEOUT_KEY),
                Lang.bind(this, function() {
                    this.show_selected_or_current_contents();
                    TIMEOUT_IDS.INFO = 0;
                })
            );

            return true;
        }

        let proceed =
            Utils.SETTINGS.get_int(PrefsKeys.ITEM_INFO_MODE_KEY)
            === Constants.ITEM_INFO_MODE.TIMEOUT;
        if(!proceed) return false;

        TIMEOUT_IDS.INFO = Mainloop.timeout_add(
            Utils.SETTINGS.get_int(PrefsKeys.ITEM_INFO_TIMEOUT_KEY),
            Lang.bind(this, function() {
                display._delegate.show_info(
                    Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY)
                );
                TIMEOUT_IDS.INFO = 0;
            })
        );

        return true;
    },

    _on_item_unselected: function(object, display) {
        if(TIMEOUT_IDS.INFO !== 0) {
            Mainloop.source_remove(TIMEOUT_IDS.INFO);
            TIMEOUT_IDS.INFO = 0;
        }

        let proceed =
            Utils.SETTINGS.get_int(PrefsKeys.ITEM_INFO_MODE_KEY)
            !== Constants.ITEM_INFO_MODE.DISABLED;
        if(!proceed) return false;

        let item_info_mode = Utils.SETTINGS.get_int(PrefsKeys.ITEM_INFO_MODE_KEY);

        if(
            item_info_mode !== Constants.ITEM_INFO_MODE.ALWAYS
            && item_info_mode !== Constants.ITEM_INFO_MODE.ALWAYS_FOR_FILES
            && !this._activate_animation_running
        ) {
            display._delegate.hide_info(
                Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY)
            );
        }

        return true;
    },

    _on_item_toggled: function(object, index, checked) {
        let hash = this._list_model.get(index).hash;

        if(checked) {
            this._merge_queue_hashes.push(hash);
        }
        else {
            let index = this._merge_queue_hashes.indexOf(hash);
            if(index !== -1) this._merge_queue_hashes.splice(index, 1);
        }

        if(this._quick_mode) return;

        if(this._merge_queue_hashes.length > 0) {
            this._merge_panel.set_label(
                'Selected %s out of %s'.format(
                    this._merge_queue_hashes.length,
                    this._history.length
                )
            );
            this._items_counter.actor.hide();
            this._buttons.actor.hide();
            this._merge_panel.show();
            if(this._merge_queue_hashes.length < 2) this._merge_panel.merge_box.hide();
            else this._merge_panel.merge_box.show();
        }
        else {
            this._merge_panel.hide();
            this._items_counter.actor.show();
            this._buttons.actor.show();
        }
    },

    _on_items_changed: function() {
        if(this._list_model.length > 0) this._status_label.hide();
        else this._status_label.show();
    },

    _on_key_press_event: function(o, e) {
        let symbol = e.get_key_symbol();
        let ch = Utils.get_unichar(symbol);
        let number = parseInt(ch);
        let code = e.get_key_code();

        if(symbol === Clutter.KEY_Control_L || symbol === Clutter.KEY_Control_R) {
            this._list_view.show_shortcuts();
            return false;
        }
        else if(e.has_control_modifier() || (this._quick_mode && !isNaN(number))) {
            if(!isNaN(number) && number >= 1 && number <= 9) {
                this._activate_by_shortcut(number);
            }

            return false;
        }
        else if(symbol === Clutter.Escape) {
            this.hide(!this._quick_mode);
            return true;
        }
        else if(symbol === Clutter.Up || (this._quick_mode && code === 25)) {
            let selected_index = this._list_view.get_selected_index();
            if(this._quick_mode && selected_index === 6 && code === 25) return true;

            if(selected_index !== -1) {
                this._list_view.select_previous();
            }
            else {
                this._list_view.select_first_visible();
            }

            return true;
        }
        else if(symbol === Clutter.Down || symbol === Clutter.Tab) {
            let selected_index = this._list_view.get_selected_index();

            if(selected_index !== -1) {
                let result = this._list_view.select_next();
                if(!result && symbol === Clutter.Tab) {
                    this._list_view.reset_scroll();
                    this._list_view.select_first_visible();
                }
            }
            else {
                this._list_view.select_first_visible();
            }

            return true;
        }
        else if(symbol === Clutter.KEY_Alt_L || symbol === Clutter.KEY_Alt_R) {
            let selected_index = this._list_view.get_selected_index();
            let display = this._list_view.get_display(selected_index);
            if(display && display._delegate.info_shown) return false;

            let mode = Utils.SETTINGS.get_int(PrefsKeys.ITEM_INFO_MODE_KEY);
            let proceed =
                mode !== Constants.ITEM_INFO_MODE.DISABLED
                && mode !== Constants.ITEM_INFO_MODE.ALWAYS;
            if(!proceed) return false;

            if(display) display._delegate.show_info(
                Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY)
            );
            return true;
        }
        else if(ch && !this._quick_mode) {
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
        let code = e.get_key_code();

        if(this._quick_mode && (symbol === Clutter.Super_R || symbol == Clutter.Super_L)) {
            this._quick_mode = false;

            if(this._merge_queue_hashes.length > 1) {
                this._merge_checked_items();
                return false;
            }

            if(e.has_control_modifier()) this._alt_activate_selected();
            else this._activate_selected();
            this.hide(false);
            return false;
        }

        if(code === 38 && e.has_control_modifier() && e.has_shift_modifier()) {
            if(this._merge_queue_hashes.length > 0) this.reset_selection();
            else this._list_view.check_all();

            return true;
        }
        else if(code === 39 && e.has_control_modifier()) {
            if(!Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_UPLOAD_KEY)) return true;
            this._upload_selected_item();

            return true;
        }
        else if(code === 40 && e.has_control_modifier()) {
            let selected_index = this._list_view.get_selected_index();
            if(selected_index !== -1) this._pin_or_unpin(selected_index);

            return true;
        }
        else if(symbol === Clutter.KEY_Control_L || symbol === Clutter.KEY_Control_R) {
            this._list_view.hide_shortcuts();

            if(this._history_switcher.shown) {
                this._history_switcher.switch_to_hovered();
                this._history_switcher.hide()
            }

            return true;
        }
        else if(symbol == Clutter.Return || symbol == Clutter.KP_Enter) {
            if(this._list_view.multiselection_mode) {
                this._merge_checked_items();
                return true;
            }

            if(e.has_control_modifier()) {
                this._alt_activate_selected();
            }
            else {
                this._activate_selected();
            }

            return true;
        }
        else if(symbol == Clutter.Delete) {
            if(this._merge_queue_hashes.length > 1) {
                this._delete_checked_items();
                return true;
            }

            let selected_index = this._list_view.get_selected_index();

            if(selected_index !== -1) {
                this.delete_item(this._list_model, selected_index);
            }

            return true;
        }
        else if(symbol === Clutter.KEY_Alt_L || symbol === Clutter.KEY_Alt_R) {
            let selected_index = this._list_view.get_selected_index();
            let display = this._list_view.get_display(selected_index);
            if(display && !display._delegate.info_shown) return false;

            let mode = Utils.SETTINGS.get_int(PrefsKeys.ITEM_INFO_MODE_KEY);
            let proceed =
                mode !== Constants.ITEM_INFO_MODE.DISABLED
                && mode !== Constants.ITEM_INFO_MODE.ALWAYS;
            if(!proceed) return false;

            if(display) display._delegate.hide_info(
                Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY)
            );
            return true;
        }
        else if(symbol === Clutter.Right) {
            let selected_index = this._list_view.get_selected_index();

            if(selected_index !== -1) {
                this._list_view.toggle_check(selected_index);

                let display = this._list_view.get_display(selected_index);
                if(!display.select_toggle.checked) display.select_toggle.hide();

            }

            return true;
        }
        else if(e.has_control_modifier() && Utils.symbol_is_tab(symbol)) {
            this._list_view.hide_shortcuts();

            if(e.has_shift_modifier()) this._history_switcher.prev();
            else this._history_switcher.next();

            return true;
        }
        else {
            return false;
        }
    },

    _on_search_key_press_event: function(o, e) {
        let symbol = e.get_key_symbol();
        let ctrl = (e.get_state() & Clutter.ModifierType.CONTROL_MASK)

        if(symbol === Clutter.Escape && !this._history_switcher.shown) {
            if(ctrl) {
                this.hide();
            }
            else {
                this._search_entry.clear();
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

        if(!this._search_entry.is_empty()) {
            TIMEOUT_IDS.FILTER = Mainloop.timeout_add(FILTER_TIMEOUT_MS,
                Lang.bind(
                    this,
                    this._filter,
                    this._search_entry.term,
                    this._search_entry.flag
                )
            );
        }
        else {
            if(this._search_entry.text === this._search_entry.hint_text) return;
            // this.actor.grab_key_focus();
            this.show_all();
        }
    },

    _on_imgur_error: function(uploader, error) {
        this._panel_progress_bar.hide();
        Main.notify(error);
    },

    _on_imgur_progress: function(uploader, uploaded, total) {
        this._panel_progress_bar.show();
        let percents = uploaded / total * 100;
        this._panel_progress_bar.set_progress_percents(percents);
    },

    _on_imgur_done: function(uploader, result) {
        this._panel_progress_bar.hide();

        if(result.link) {
            GPasteClient.get_client().add(result.link);
        }
    },

    _on_fpaste_error: function(uploader, error) {
        this._panel_progress_bar.hide();
        Main.notifyError(error);
    },

    _on_fpaste_done: function(uploader, result_url) {
        this._panel_progress_bar.hide();
        if(Utils.is_blank(result_url)) return;
        GPasteClient.get_client().add(result_url);
    },

    _resize: function() {
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

        let my_width = Math.floor(monitor.width / 100 * width_percents);
        let my_height = Math.floor(available_height / 100 * height_percents);

        this._hidden_y = Math.floor(monitor.y - my_height);
        this._target_y = Math.floor(this._hidden_y + my_height);
        if(is_primary) this._target_y += Main.panel.actor.height;

        this.actor.x = Math.floor(monitor.width + monitor.x - my_width);
        this.actor.y = this._hidden_y;
        this.actor.width = my_width;
        this.actor.height = my_height;

        this._table.width = my_width;
        this._table.height = my_height;
    },

    _disconnect_all: function() {
        GPasteClient.get_client().disconnect(CONNECTION_IDS.client_show_history);
        this._history.disconnect(CONNECTION_IDS.history_changed);
        this._history.disconnect(CONNECTION_IDS.history_name_changed);
        this._disconnect_captured_event();
        Utils.SETTINGS.disconnect(CONNECTION_IDS.item_info_mode);
        Utils.SETTINGS.disconnect(CONNECTION_IDS.image_preview);
        Utils.SETTINGS.disconnect(CONNECTION_IDS.show_indexes);

        CONNECTION_IDS.client_show_history = 0;
        CONNECTION_IDS.history_changed = 0;
        CONNECTION_IDS.history_name_changed = 0;
        CONNECTION_IDS.item_info_mode = 0;
        CONNECTION_IDS.image_preview = 0;
        CONNECTION_IDS.show_indexes = 0;
    },

    _activate_selected: function() {
        let selected_index = this._list_view.get_selected_index();

        if(selected_index !== -1) {
            this.activate_item(this._list_model, selected_index);
        }
    },

    _alt_activate_selected: function(history_item) {
        if(!(history_item instanceof GPasteHistoryItem.GPasteHistoryItem)) {
            let selected_index = this._list_view.get_selected_index();
            if(selected_index === -1) return;
            history_item = this._list_model.get(selected_index);
        }

        if(history_item.is_text_item()) return;
        history_item.get_raw(Lang.bind(this, function(result) {
            if(!result) return;

            let uri = result;

            if(history_item.is_file_item() || history_item.is_image_item()) {
                let count = result.split('\n');
                if(count.length > 1) return;
                uri = 'file://' + uri;
            }
            else if(history_item.is_link_item()) {
                uri = Utils.get_url(result);
                if(!uri) return;
            }
            else {
                return;
            }

            try {
                Gio.app_info_launch_default_for_uri(
                    uri,
                    global.create_app_launch_context(0, -1)
                );
            }
            catch(e) {
                log('GPasteIntegration:_alt_activate_selected: ' + e);
                return;
            }

            let display = this._list_view.get_display_for_item(history_item);
            if(display) this._show_activate_animation(display);
            this._history_changed_trigger = true;
            this.hide(false);
        }))
    },

    _activate_by_shortcut: function(number) {
        let index = this._list_view.get_index_for_shortcut(number);
        if(index === -1) return;
        this.activate_item(this._list_model, index);
    },

    _show_items: function(history_items) {
        this._list_model.set_items(history_items);
        this._list_view.select_first_visible();
        if(this._merge_queue_hashes.length < 1) return;

        for(let index in this._list_model.items) {
            let hash = this._list_model.get(index).hash;
            let hash_checked = this._merge_queue_hashes.indexOf(hash) !== -1;
            if(hash_checked) this._list_view.check(index, true);
        }
    },

    _filter: function(term, flag) {
        if(TIMEOUT_IDS.FILTER !== 0) {
            Mainloop.source_remove(TIMEOUT_IDS.FILTER);
            TIMEOUT_IDS.FILTER = 0;
        }

        function on_filter_result(matches) {
            let items = [];

            for(let i = 0; i < matches.length; i++) {
                let item = Object.create(matches[i].original);

                if(flag === GPasteSearchEntry.SEARCH_FLAGS.ONLY_FILES) {
                    if(!item.is_file_item() && !item.is_image_item()) continue;
                }
                if(flag === GPasteSearchEntry.SEARCH_FLAGS.ONLY_TEXT) {
                    if(
                        item.is_file_item()
                        || item.is_image_item()
                        || item.is_link_item()
                    ) continue;
                }
                if(flag === GPasteSearchEntry.SEARCH_FLAGS.ONLY_LINKS) {
                    if(!item.is_link_item()) continue;
                }

                item.markup = matches[i].string;
                items.push(item);
            }

            this._show_items(items);
            this._list_view.reset_scroll();
            this._list_view.select_first_visible();
        }

        if(this._search_entry.flag === GPasteSearchEntry.SEARCH_FLAGS.ONLY_CHECKED) {
            this._show_only_checked();
        }
        else {
            this._fuzzy_search.filter(
                term,
                this._history.get_items(),
                Lang.bind(this, on_filter_result)
            );
        }
    },

    _show_activate_animation: function(display) {
        let animation = Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY);

        if(!animation) {
            this._search_entry.clear();
            return;
        }

        this._activate_animation_running = true;
        let [x, y] = display.get_transformed_position();
        let clone = new Clutter.Clone({
            source: display,
            width: this._table.width,
            height: display.height,
            x: x,
            y: y
        });
        clone.set_pivot_point(0.5, 0.5);
        Main.uiGroup.add_child(clone);

        let transition = Utils.SETTINGS.get_string(
            PrefsKeys.ACTIVATE_TRANSITION_TYPE_KEY
        );
        let time = Utils.SETTINGS.get_double(
            PrefsKeys.ACTIVATE_ANIMATION_TIME_KEY
        );
        Tweener.addTween(clone, {
            delay: 0.2,
            time: time,
            scale_x: 1.5,
            scale_y: 1.5,
            opacity: 0,
            transition: transition,
            onComplete: Lang.bind(this, function() {
                clone.destroy();
                display._delegate.hide_info();
                this._activate_animation_running = false;
                this._search_entry.clear();
            })
        });
    },

    _pin_or_unpin: function(index) {
        let history_item = this._list_model.get(index);
        let pinned_index =
            PinnedItemsManager.get_manager().get_index_by_text(history_item.text);

        if(pinned_index !== -1) {
            PinnedItemsManager.get_manager().remove(pinned_index);
        }
        else {
            PinnedItemsManager.get_manager().add(history_item.text);
        }
    },

    _merge_checked_items: function() {
        if(this._merge_queue_hashes.length < 2) return;

        let merge_indexes = [];

        for each(let hash in this._merge_queue_hashes) {
            let history_item = this._history.get_by_hash(hash);
            if(history_item !== null) merge_indexes.push(history_item.index);
        }

        let decorator = Utils.unescape_special_chars(this._merge_panel.decorator);
        let separator = Utils.unescape_special_chars(this._merge_panel.separator);
        GPasteClient.get_client().merge_sync(decorator, separator, merge_indexes);
        this._merge_queue_hashes = [];
        this.hide(false);
    },

    _delete_checked_items: function() {
        if(this._merge_queue_hashes.length < 1) return;

        let delete_indexes = [];

        for each(let hash in this._merge_queue_hashes) {
            let history_item = this._history.get_by_hash(hash);
            if(history_item === null) continue;
            delete_indexes.push(history_item.index);
        }

        delete_indexes.sort(function(a, b) {return a - b});
        this.reset_selection();

        for(let i = 0; i < delete_indexes.length; i++) {
            let index = delete_indexes[i];

            for (let model_index in this._list_model.items) {
                let model_hash = this._list_model.get(model_index).hash;
                if(this._history.items[index].hash === model_hash) {
                    this._list_model.delete(model_index);
                    break;
                }
            }

            GPasteClient.get_client().delete_sync(index - i);
        }

        this._last_selected_item_index = null;

        if(this._list_model.length <= 1 && this._search_entry.is_empty()) {
            GPasteClient.get_client().empty();
            this.hide();
        }
        else {
            this._list_view._preload_items();
        }
    },

    _upload_selected_item: function(history_item) {
        if(!(history_item instanceof GPasteHistoryItem.GPasteHistoryItem)) {
            let selected_index = this._list_view.get_selected_index();
            if(selected_index === -1) return;
            history_item = this._list_model.get(selected_index);
        }

        if(history_item.is_text_item() || history_item.is_link_item()) {
            this._panel_progress_bar.pulse_mode = true;
            this._panel_progress_bar.show();
            this._panel_progress_bar.start();
            history_item.get_raw(Lang.bind(this, function(result) {
                this.hide(false);
                this._fpaste_uploader.upload(result);
            }));
            return;
        }

        history_item.get_info(
            Lang.bind(this, function(result, uri, content_type, raw) {
                if(!content_type || !raw) return;
                if(!Utils.starts_with(content_type, 'image')) return;

                this.hide(false);
                this._imgur_uploader.upload(raw, content_type);
            })
        );
    },

    _show_only_checked: function() {
        let history_items = [];

        for each(let hash in this._merge_queue_hashes) {
            let history_item = this._history.get_by_hash(hash);
            if(history_item !== null) history_items.push(history_item);
        }

        this._show_items(history_items);
    },

    show_all: function() {
        this._show_items(this._history.get_items());
        this._list_view.reset_scroll();
        this._list_view.select_first_visible();
    },

    activate_item: function(model, index) {
        let history_item = model.get(index);
        let display = this._list_view.get_display_for_item(history_item);

        if(display) this._show_activate_animation(display);
        else this._search_entry.clear();

        this.hide(false);

        GPasteClient.get_client().select(history_item.index);
    },

    delete_item: function(model, index) {
        if(model.length <= 1 && this._search_entry.is_empty()) {
            GPasteClient.get_client().empty();
            this._last_selected_item_index = null;
            this.hide();
            return;
        }

        let history_item = model.get(index);
        model.delete(index);

        if(model.length === index) {
            this._last_selected_item_index = index - 1;
        }
        else {
            this._last_selected_item_index = index;
        }

        GPasteClient.get_client().delete_sync(history_item.index);
    },

    show: function(animation, target) {
        if(this._open) return;

        animation =
            animation === undefined
            ? Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY)
            : animation;
        let push_result = Main.pushModal(this.actor, {
            actionMode: Shell.ActionMode.NORMAL
        });

        if(!push_result) return;

        this._open = true;
        this.actor.show();
        this._list_view.actor.show();
        this._search_entry.show();
        this._buttons.actor.show();
        this._items_counter.actor.show();
        this._resize();
        target = target === undefined ? this._target_y : target;

        if(this._history_changed_trigger) {
            this.show_all();
            this._history_changed_trigger = false;
        }

        if(animation) {
            let time = Utils.SETTINGS.get_double(
                PrefsKeys.OPEN_ANIMATION_TIME_KEY
            );
            let transition = Utils.SETTINGS.get_string(
                PrefsKeys.OPEN_TRANSITION_TYPE_KEY
            );
            Tweener.removeTweens(this.actor);
            Tweener.addTween(this.actor, {
                time: time / St.get_slow_down_factor(),
                transition: transition,
                y: target,
                onComplete: Lang.bind(this, function() {
                    this._list_view.select_first_visible();
                    this.emit('shown');
                })
            });
        }
        else {
            this.actor.y = target;
            this._list_view.select_first_visible();
            this.emit('shown');
        }

        if(!this._search_entry.is_empty()) {
            if(this._quick_mode) {
                this.show_all();
                return;
            }

            this._search_entry.clutter_text.set_selection(
                0,
                this._search_entry.text.length
            );
            this._filter(
                this._search_entry.term,
                this._search_entry.flag
            );
            this._search_entry.grab_key_focus();
        }

        this._connect_captured_event();
        this._list_view.overlay_shortcut_emblems = true;
        this._list_view.select_on_hover = true;
        this._list_view.reset_scroll();

        this._merge_panel.decorator_entry.set_text(
            Utils.SETTINGS.get_string(PrefsKeys.MERGE_DECORATOR_KEY)
        );
        this._merge_panel.separator_entry.set_text(
            Utils.SETTINGS.get_string(PrefsKeys.MERGE_SEPARATOR_KEY)
        );
    },

    hide: function(animation, target) {
        if(TIMEOUT_IDS.QUICK_MODE_SHORTCUTS > 0) {
            Mainloop.source_remove(TIMEOUT_IDS.QUICK_MODE_SHORTCUTS);
            TIMEOUT_IDS.QUICK_MODE_SHORTCUTS = 0;
        }

        if(!this._open) return;

        Main.popModal(this.actor);
        this._open = false;
        this._quick_mode = false;
        this._disconnect_captured_event();
        this._list_view.unselect_all();
        this._list_view.hide_shortcuts(false);
        this._history_switcher.hide();
        this.reset_selection();
        animation =
            animation === undefined
            ? Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY)
            : animation;

        if(animation) {
            let time = Utils.SETTINGS.get_double(
                PrefsKeys.CLOSE_ANIMATION_TIME_KEY
            );
            let transition = Utils.SETTINGS.get_string(
                PrefsKeys.CLOSE_TRANSITION_TYPE_KEY
            );
            Tweener.removeTweens(this.actor);
            Tweener.addTween(this.actor, {
                time: time / St.get_slow_down_factor(),
                transition: transition,
                y: this._hidden_y,
                onComplete: Lang.bind(this, function() {
                    this.actor.hide();
                    this.emit('hidden');
                })
            });
        }
        else {
            this.actor.hide();
            this.actor.y = this._hidden_y;
            this.emit('hidden');
        }
    },

    toggle: function() {
        if(this._open) this.hide();
        else this.show();
    },

    show_selected_or_current_contents: function(params) {
        if(this._contents_preview_dialog.shown) return;

        params = Params.parse(params, {
            item_index: null,
            no_modal: false,
            relative_actor: null,
            side: St.Side.LEFT,
            hide_on_scroll_outside: true
        });
        let history_item = this._history.items[0];
        let modal = true;
        let display = null;

        if(Utils.is_int(params.item_index)) {
            history_item = this._history.items[params.item_index];
        }
        else {
            let animation = Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY);
            let selected_index = this._list_view.get_selected_index();
            display = this._list_view.get_display(selected_index);

            if(display) {
                history_item = display._delegate._history_item;
                modal = false;

                if(animation) {
                    display.opacity = 20;
                    Tweener.removeTweens(display);
                    Tweener.addTween(display, {
                        time: 0.3,
                        transition: 'easeInBounce',
                        opacity: 255
                    });
                }
            }
        }

        this._contents_preview_dialog.preview(
            history_item,
            params.relative_actor || display,
            params.side,
            params.no_modal ? false : modal,
            params.hide_on_scroll_outside
        );
    },

    hide_clipboard_preview: function() {
        this._contents_preview_dialog.hide(
            Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY)
        );
    },

    quick_mode: function() {
        if(this._open || this._quick_mode) return;

        this._quick_mode = true;
        this.show(false);
        this._list_view.overlay_shortcut_emblems = false;
        this._list_view.unselect_all();
        this._list_view.select_on_hover = false;

        let monitor = Main.layoutManager.currentMonitor;
        let is_primary = monitor.index === Main.layoutManager.primaryIndex;

        let available_height = monitor.height;
        if(is_primary) available_height -= Main.panel.actor.height;

        this._search_entry.hide();
        this._buttons.actor.hide();
        this._items_counter.actor.hide();
        this.actor.x =
            Math.floor(monitor.width / 2)
            - Math.floor(this.actor.width / 2);
        this.actor.y =
            Math.floor(available_height / 2)
            - Math.floor(this.actor.height / 2);
        if(is_primary) this.actor.y += Main.panel.actor.height;

        TIMEOUT_IDS.QUICK_MODE_SHORTCUTS = Mainloop.timeout_add(200,
            Lang.bind(this, function() {
                TIMEOUT_IDS.QUICK_MODE_SHORTCUTS = 0;
                this._list_view.show_shortcuts(false);
            })
        );
    },

    reset_selection: function() {
        this._list_view.uncheck_all();
        this._merge_queue_hashes = [];
        this._merge_panel.hide();
        this._items_counter.actor.show();
        this._buttons.actor.show();
    },

    destroy: function() {
        this._imgur_uploader = null;
        this._fpaste_uploader = null;
        this._disconnect_all();
        this._buttons.destroy();
        this._list_view.destroy();
        this._items_counter.destroy();
        this._history_switcher.destroy();
        this._history.destroy();
        this._search_entry.destroy();
        this.actor.destroy();
    },

    get is_open() {
        return this._open;
    },

    get history() {
        return this._history;
    },

    get history_switcher() {
        return this._history_switcher;
    },

    get progress_bar() {
        return this._panel_progress_bar;
    }
});
Signals.addSignalMethods(GPasteIntegration.prototype);
