const St = imports.gi.St;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const Pango = imports.gi.Pango;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const PopupDialog = Me.imports.popup_dialog;
const ItemInfoView = Me.imports.item_info_view;

const ContentsPreviewView = new Lang.Class({
    Name: 'ContentsPreviewView',

    _init: function(contents) {
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

        this._label_box = new St.BoxLayout({
            vertical: true
        });
        this._label_box.add_child(this._entry);
        this._scroll_view = new St.ScrollView({
            overlay_scrollbars: true
        });
        this._scroll_view.add_actor(this._label_box);
        this.actor.add_child(this._scroll_view);

        this.info_view = new ItemInfoView.ItemInfoView({
            label_style_class: 'gpaste-item-box-info-label'
        });
        this.info_view.show();
        this.actor.add(this.info_view.actor, {
            x_expand: false,
            x_fill: false,
            x_align: St.Align.END,
            y_expand: false,
            y_fill: false,
            y_align: St.Align.MIDDLE
        });

        this.set_contents(contents);
    },

    set_contents: function(contents) {
        this._entry.set_text(contents);
    },

    add_image: function(actor) {
        this._image_box.add_child(actor);
    },

    clear: function() {
        this._entry.set_text('');
    },

    destroy: function() {
        this.actor.destroy();
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

    _init: function() {
        this.parent({
            modal: true
        });

        this._box = new St.BoxLayout({
            style_class: 'gpaste-contents-preview-dialog'
        });
        this.actor.add_child(this._box);

        this.connect('hidden', Lang.bind(this, this.clear));

        this._contents_view = null;
        this._relative_actor = null;
    },

    _on_captured_event: function(o, e) {
        if(e.type() === Clutter.EventType.KEY_RELEASE) {
            let symbol = e.get_key_symbol();

            if(symbol === Clutter.Super_R || symbol == Clutter.Super_L) {
                this.hide(
                    Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY)
                );
            }

            return true;
        }
        else if(e.type() === Clutter.EventType.KEY_PRESS) {
            let symbol = e.get_key_symbol();

            if(symbol === Clutter.Up) this._scroll_step_up();
            if(symbol === Clutter.Down) this._scroll_step_down();

            if(symbol === Clutter.Control_L || symbol === Clutter.Control_R) {
                let clipboard = St.Clipboard.get_default();
                clipboard.set_text(
                    St.ClipboardType.CLIPBOARD,
                    this._contents_view.selection
                );
            }

            return true;
        }
        else if(e.type() === Clutter.EventType.SCROLL) {
            let direction = e.get_scroll_direction();

            if(direction === Clutter.ScrollDirection.UP) {
                this._scroll_step_up();
            }
            if(direction === Clutter.ScrollDirection.DOWN) {
                this._scroll_step_down();
            }

            return true;
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

        this._contents_view.actor.width = this._relative_actor.width - margin;

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

        this.actor.x = x + offset_x;
        this.actor.y = y + offset_y;
    },

    clear: function() {
        if(this._contents_view !== null) this._contents_view.destroy();
        this._contents_view = null;
    },

    preview: function(history_item, relative_actor) {
        this.clear();

        if(relative_actor) this._relative_actor = relative_actor;
        else this._relative_actor = null;

        history_item.get_raw(
            Lang.bind(this, function(raw_item) {
                if(!raw_item) return;

                this._contents_view = new ContentsPreviewView(raw_item);
                this._box.add_child(this._contents_view.actor);

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
        let image = texture_cache.load_uri_async(
            uri,
            Utils.SETTINGS.get_int(PrefsKeys.PREVIEW_IMAGE_MAX_WIDTH_KEY),
            Utils.SETTINGS.get_int(PrefsKeys.PREVIEW_IMAGE_MAX_HEIGHT_KEY),
            scale_factor
        );
        image.connect('size-change',
            Lang.bind(this, function() {
                this._reposition();
            })
        );

        this._contents_view.add_image(image);
    },
});
