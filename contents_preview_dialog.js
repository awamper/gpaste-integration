const St = imports.gi.St;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const Pango = imports.gi.Pango;
const Gio = imports.gi.Gio;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const Mainloop = imports.mainloop;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const PopupDialog = Me.imports.popup_dialog;
const ItemInfoView = Me.imports.item_info_view;
const GPasteClient = Me.imports.gpaste_client;

const LEAVE_TIMEOUT_MS = 40;
const COPY_SELECTION_TIMEOUT_MS = 400;
const TIMEOUT_IDS = {
    LEAVE: 0,
    SELECTION: 0
};

const ContentsPreviewView = new Lang.Class({
    Name: 'ContentsPreviewView',

    _init: function(gpaste_integration, contents) {
        this._contents = contents;
        let style_string =
            'min-width: %spx; max-width: %spx; min-height: 80px; max-height: %spx;'
            .format(
                Utils.SETTINGS.get_int(PrefsKeys.PREVIEW_MIN_WIDTH_PX_KEY),
                Utils.SETTINGS.get_int(PrefsKeys.PREVIEW_MAX_WIDTH_PX_KEY),
                Utils.SETTINGS.get_int(PrefsKeys.PREVIEW_MAX_HEIGHT_PX_KEY)
            );

        this.actor = new St.BoxLayout({
            style_class: 'gpaste-dialog-contents-view-box',
            style: style_string,
            vertical: true
        });
        this.actor.connect('destroy', Lang.bind(this, this.destroy));

        this.image_actor = null;
        this._image_box = new St.BoxLayout();
        this.actor.add_child(this._image_box);

        this._entry = new St.Entry({
            style_class: 'gpaste-contents-preview-entry'
        });
        this._entry.clutter_text.set_single_line_mode(false);
        this._entry.clutter_text.set_activatable(false);
        this._entry.clutter_text.set_editable(true);
        this._entry.clutter_text.set_line_wrap(true);
        this._entry.clutter_text.set_line_wrap_mode(
            Pango.WrapMode.WORD
        );
        this._entry.clutter_text.set_ellipsize(
            Pango.EllipsizeMode.NONE
        );
        this._entry.clutter_text.connect('cursor-changed', Lang.bind(this, this._on_cursor_changed));

        this._label_box = new St.BoxLayout({
            vertical: true
        });
        this._label_box.add_child(this._entry);
        this._scroll_view = new St.ScrollView({
            overlay_scrollbars: true
        });
        this._scroll_view.add_actor(this._label_box);
        this.actor.add_child(this._scroll_view);

        let info_box = new St.Table();

        this.activate_button = new St.Button({
            label: 'Open',
            style_class: 'gpaste-preview-activate-button',
            visible: false
        });
        info_box.add(this.activate_button, {
            row: 0,
            col: 0,
            x_expand: true,
            x_fill: false,
            x_align: St.Align.START,
            y_expand: false,
            y_fill: false,
            y_align: St.Align.MIDDLE
        });

        this.info_view = new ItemInfoView.ItemInfoView({
            label_style_class: 'gpaste-item-box-info-label'
        });
        this.info_view.show();
        info_box.add(this.info_view.actor, {
            row: 0,
            col: 1,
            x_expand: true,
            x_fill: false,
            x_align: St.Align.END,
            y_expand: false,
            y_fill: false,
            y_align: St.Align.MIDDLE
        });

        this.actor.add_child(info_box, {
            x_expand: false,
            x_fill: false,
            x_align: St.Align.START,
            y_expand: false,
            y_fill: false,
            y_align: St.Align.MIDDLE
        })
        this._copy_button = new St.Button({
            label: 'copy selection',
            visible: false,
            style_class: 'gpaste-copy-button'
        });
        this._copy_button.connect('clicked', Lang.bind(this, function() {
            this._copy_button.hide();
            let selection = this._entry.clutter_text.get_selection();

            if(!Utils.is_blank(selection)) {
                gpaste_integration.force_update = true;
                GPasteClient.get_client().add(selection);
            }
        }));
        Main.uiGroup.add_child(this._copy_button);

        this.set_contents(contents);
    },

    _on_cursor_changed: function() {
        this._remove_timeout();
        let selection = this._entry.clutter_text.get_selection();

        if(!Utils.is_blank(selection)) {
            TIMEOUT_IDS.SELECTION = Mainloop.timeout_add(
                COPY_SELECTION_TIMEOUT_MS,
                Lang.bind(this, function() {
                    this._remove_timeout();

                    let [pointer_x, pointer_y] = global.get_pointer();
                    this._copy_button.translation_x = pointer_x + 5;
                    this._copy_button.translation_y = pointer_y + 5;
                    this._copy_button.show();
                })
            );
        }
        else {
            this._copy_button.hide();
        }
    },

    _remove_timeout: function() {
        if(TIMEOUT_IDS.SELECTION > 0) {
            Mainloop.source_remove(TIMEOUT_IDS.SELECTION);
            TIMEOUT_IDS.SELECTION = 0;
        }
    },

    set_contents: function(contents) {
        this._entry.set_text(contents);
    },

    add_image: function(actor) {
        this.image_actor = actor;
        this._image_box.add_child(this.image_actor);
    },

    clear: function() {
        this._remove_timeout();

        if(this.image_actor) {
            this.image_actor.destroy();
            this.image_actor = null;
        }

        this._copy_button.hide();
        this._entry.set_text('');
    },

    destroy: function() {
        this._remove_timeout();
        this._copy_button.destroy();
        this.actor.destroy();
        this.image_actor = null;
    },

    get scroll() {
        return this._scroll_view;
    },

    get selection() {
        return this._entry.clutter_text.get_selection()
    }
});

const ContentsPreviewDialog = new Lang.Class({
    Name: 'ContentsPreviewDialog',
    Extends: PopupDialog.PopupDialog,

    _init: function(gpaste_integration) {
        this.parent({
            modal: false
        });

        this._box = new St.BoxLayout({
            style_class: 'gpaste-contents-preview-dialog'
        });
        this.actor.add_child(this._box);

        this.connect('hidden', Lang.bind(this, this.clear));

        this._contents_view = null;
        this._relative_actor = null;
        this._image_width = 0;
        this._gpaste_integration = gpaste_integration;
    },

    _on_captured_event: function(o, e) {
        if(e.type() === Clutter.EventType.KEY_RELEASE) {
            let symbol = e.get_key_symbol();

            if(
                symbol === Clutter.Super_R ||
                symbol === Clutter.Super_L ||
                symbol === Clutter.Escape ||
                this._relative_actor
            ) {
                let animation =
                    !this._relative_actor
                    ? Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY)
                    : false;
                this.hide(animation);
            }

            return false;
        }
        else if(e.type() === Clutter.EventType.KEY_PRESS) {
            let symbol = e.get_key_symbol();

            if(!this._relative_actor) {
                if(symbol === Clutter.Up) this._scroll_step_up();
                if(symbol === Clutter.Down) this._scroll_step_down();
            }

            if(symbol === Clutter.Control_L || symbol === Clutter.Control_R) {
                let clipboard = St.Clipboard.get_default();
                clipboard.set_text(
                    St.ClipboardType.CLIPBOARD,
                    this._contents_view.selection
                );
            }

            return false;
        }
        else if(e.type() === Clutter.EventType.SCROLL) {
            if(this._relative_actor && !Utils.is_pointer_inside_actor(this.actor)) {
                this.hide(false);
                return false;
            }

            let direction = e.get_scroll_direction();

            if(direction === Clutter.ScrollDirection.UP) {
                this._scroll_step_up();
            }
            if(direction === Clutter.ScrollDirection.DOWN) {
                this._scroll_step_down();
            }

            return true;
        }
        else if(e.type() === Clutter.EventType.MOTION) {
            if(!this._relative_actor) return false;

            if(TIMEOUT_IDS.LEAVE !== 0) {
                Mainloop.source_remove(TIMEOUT_IDS.LEAVE);
                TIMEOUT_IDS.LEAVE = 0;
            }

            if(
                !Utils.is_pointer_inside_actor(this.actor) &&
                !Utils.is_pointer_inside_actor(this._relative_actor)
            ) {
                TIMEOUT_IDS.LEAVE = Mainloop.timeout_add(
                    LEAVE_TIMEOUT_MS,
                    Lang.bind(this, function() {
                        this.hide(false);
                        TIMEOUT_IDS.LEAVE = 0;
                    })
                );
            }

            return false;
        }

        return false;
    },

    _scroll_step_up: function() {
        if(this._contents_view === null || !this.shown) return;
        let value = this._contents_view.scroll.vscroll.adjustment.value;
        let step_increment =
            this._contents_view.scroll.vscroll.adjustment.step_increment;
        
        if(value > 0) {
            this._contents_view.scroll.vscroll.adjustment.value =
                value - step_increment;
        }
    },

    _scroll_step_down: function() {
        if(this._contents_view === null || !this.shown) return;
        let value = this._contents_view.scroll.vscroll.adjustment.value;
        let step_increment =
            this._contents_view.scroll.vscroll.adjustment.step_increment;
        let upper =
            this._contents_view.scroll.vscroll.adjustment.upper;
        
        if(value < upper) {
            this._contents_view.scroll.vscroll.adjustment.value =
                value + step_increment;
        }
    },

    _reposition: function() {
        let margin = 20;
        let monitor = Main.layoutManager.currentMonitor;

        if(!this._relative_actor) {
            margin = Main.panel.actor.height;
            this.actor.x = monitor.width - this.actor.width - margin;
            this.actor.y = Main.panel.actor.y + margin * 2;
            return;
        }

        let [x, y] = this._relative_actor.get_transformed_position();
        let available_width =
            (monitor.width + monitor.x) - x;
        let available_height =
            (monitor.height + monitor.y) - y;

        let offset_x = 10;
        let offset_y = 10;

        if(!this._contents_view.image_actor) {
            // this._contents_view.actor.width = this._relative_actor.width - margin;
        }
        else {
            if(this._image_width > 0) {
                this._contents_view.actor.width = this._image_width;
            }

        }

        if(this.actor.width > available_width) {
            offset_x =
                (monitor.width + monitor.x)
                - (this.actor.width + x + margin);
        }
        if(this.actor.height > available_height) {
            offset_y =
                (monitor.height + monitor.y)
                - (this.actor.height + y + margin);
        }

        this.actor.x = x - this.actor.width - margin;
        this.actor.y = y + offset_y - margin;
    },

    clear: function() {
        if(TIMEOUT_IDS.LEAVE !== 0) {
            Mainloop.source_remove(TIMEOUT_IDS.LEAVE);
            TIMEOUT_IDS.LEAVE = 0;
        }

        if(this._contents_view !== null) this._contents_view.destroy();
        this._contents_view = null;
        this._image_width = 0;
    },

    preview: function(history_item, relative_actor, modal) {
        this.clear();

        modal === true ? this.enable_modal() : this.disable_modal();
        relative_actor ? this._relative_actor = relative_actor : this._relative_actor = null;

        history_item.get_raw(
            Lang.bind(this, function(raw_item) {
                if(!raw_item) return;

                this._contents_view = new ContentsPreviewView(this._gpaste_integration, raw_item);
                this._box.add_child(this._contents_view.actor);

                if(!history_item.is_text_item()) {
                    this._contents_view.activate_button.connect('clicked',
                        Lang.bind(this, function() {
                            this._gpaste_integration._alt_activate_selected(history_item.index);
                        })
                    );
                    this._contents_view.activate_button.show();
                }

                this.show(
                    Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY)
                );
                this._reposition();

                history_item.get_info(
                    Lang.bind(this, function(result, uri) {
                        if(!result) {
                            this._contents_view.info_view.hide();
                        }
                        else {
                            this._contents_view.info_view.set_text(result);
                            if(uri !== null) this.show_image(uri);
                        }
                    })
                );
            })
        );
    },

    show_image: function(uri) {
        let scale_factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let texture_cache = St.TextureCache.get_default();
        let image_file = Gio.file_new_for_uri(uri);
        let image = texture_cache.load_file_async(
            image_file,
            Utils.SETTINGS.get_int(PrefsKeys.PREVIEW_IMAGE_MAX_WIDTH_KEY),
            Utils.SETTINGS.get_int(PrefsKeys.PREVIEW_IMAGE_MAX_HEIGHT_KEY),
            scale_factor
        );
        image.connect('size-change',
            Lang.bind(this, function() {
                if(this._contents_view.image_actor.width < 1) return;
                this._image_width = this._contents_view.image_actor.width;
                this._reposition();
            })
        );

        this._contents_view.add_image(image);
    },

    destroy: function() {
        if(TIMEOUT_IDS.LEAVE !== 0) {
            Mainloop.source_remove(TIMEOUT_IDS.LEAVE);
            TIMEOUT_IDS.LEAVE = 0;
        }

        this._image_width = 0;
        this._gpaste_integration = null;
        this.parent();
    }
});
