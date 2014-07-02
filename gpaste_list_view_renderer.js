const St = imports.gi.St;
const Lang = imports.lang;
const Pango = imports.gi.Pango;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;
const Tweener = imports.ui.tweener;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const ListView = Me.imports.list_view;
const ItemInfoView = Me.imports.item_info_view;
const GPasteClient = Me.imports.gpaste_client;
const PrefsKeys = Me.imports.prefs_keys;

const MAX_DISPLAYED_STRING_LENGTH = 300;

const HIGHLIGHT_MARKUP = {
    START: "<span foreground='white' font_weight='heavy' underline='single'>",
    STOP: '</span>'
};

const TIMEOUT_IDS = {
    INFO: 0
};

const INFO_ANIMATION_TIME_S = 0.3;
const IMAGE_PREVIEW_WIDTH = 100;
const IMAGE_PREVIEW_HEIGHT = 100;

const GPasteListViewRenderer = new Lang.Class({
    Name: 'GPasteListViewRenderer',
    Extends: ListView.RendererBase,

    _init: function(params) {
        this.parent({
            style_class: 'gpaste-item-box',
        });
        this.actor.connect('style-changed', Lang.bind(this, this._on_style_changed));

        this._info_view = new ItemInfoView.ItemInfoView({
            label_style_class: 'gpaste-item-box-info-label'
        });
        this._info_view.actor.set_pivot_point(0.5, 0.5);
        this._history_item = null;
        this._image_preview = null;
    },

    _on_style_changed: function(actor) {
        if(!Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ITEM_INFO_KEY)) return;

        if(actor.has_style_pseudo_class('hover')) {
            TIMEOUT_IDS.INFO = Mainloop.timeout_add(
                Utils.SETTINGS.get_int(PrefsKeys.ITEM_INFO_TIMEOUT_KEY),
                Lang.bind(this, function() {
                    this._show_info();
                    TIMEOUT_IDS.INFO = 0;
                })
            );
        }
        else {
            if(TIMEOUT_IDS.INFO !== 0) {
                Mainloop.source_remove(TIMEOUT_IDS.INFO);
                TIMEOUT_IDS.INFO = 0;
            }

            this._hide_info();
        }
    },

    _prepare_string: function(str) {
        str = str.replace(/\n/g, ' ');
        str = str.replace(/\s{2,}/g, ' ');
        str = str.trim();
        return str;
    },

    _show_text: function(text) {
        text = this._prepare_string(text);
        this.title_label.set_text(text);
    },

    _show_markup: function(markup) {
        let min = 45;
        let start_index = markup.indexOf(HIGHLIGHT_MARKUP.START);

        if(start_index !== -1 && start_index > min) {
            markup = "..." + markup.slice(start_index - min);
        }

        markup = this._prepare_string(markup);
        this.title_label.clutter_text.set_markup(markup);
    },

    _show_image_preview: function(uri) {
        let scale_factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let texture_cache = St.TextureCache.get_default();

        this._image_preview = texture_cache.load_uri_async(
            uri,
            IMAGE_PREVIEW_WIDTH,
            IMAGE_PREVIEW_HEIGHT,
            scale_factor
        );
        this.actor.add(this._image_preview, {
            row: 0,
            row_span: 2,
            col: 0,
            x_expand: false,
            x_fill: false,
            x_align: St.Align.MIDDLE,
            y_expand: false,
            y_fill: false,
            y_align: St.Align.MIDDLE
        });
    },

    _show_info: function() {
        if(!this._history_item.hash || this._info_view.shown) return;

        function on_info_result(text, uri) {
            if(!text || !this.actor.has_style_pseudo_class('hover')) return;

            this.actor.add(this._info_view.actor, {
                row: 1,
                col: 1,
                x_expand: false,
                x_fill: false,
                x_align: St.Align.START,
                y_expand: false,
                y_fill: false,
                y_align: St.Align.START
            });
            this._info_view.set_text(text);
            let height = this._info_view.actor.get_preferred_height(-1)[1];
            this._info_view.actor.set_height(0);
            this._info_view.actor.set_opacity(0);
            this._info_view.actor.set_scale(1, 0)
            this._info_view.show();

            Tweener.removeTweens(this._info_view.actor);
            Tweener.addTween(this._info_view.actor, {
                time: INFO_ANIMATION_TIME_S / St.get_slow_down_factor(),
                transition: 'easeOutQuad',
                height: height,
                scale_y: 1,
                opacity: 255
            });

            if(Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_IMAGE_PREVIEW_KEY)) {
                if(uri !== null) this._show_image_preview(uri);
            }
        }

        this._history_item.get_info(Lang.bind(this, on_info_result));
    },

    _hide_info: function() {
        if(!this._info_view.shown) return;

        let height = this._info_view.actor.get_height();
        Tweener.removeTweens(this._info_view.actor);
        Tweener.addTween(this._info_view.actor, {
            time: INFO_ANIMATION_TIME_S / St.get_slow_down_factor(),
            transition: 'easeOutQuad',
            height: 0,
            scale_y: 1,
            opacity: 0,
            onComplete: Lang.bind(this, function() {
                this.actor.remove_child(this._info_view.actor);
                this._info_view.hide();
                this._info_view.set_text('');
                this._info_view.actor.set_height(height);
                this._info_view.actor.set_scale(1, 1);
                this._info_view.actor.set_opacity(255);
            })
        });

        if(this._image_preview && this.actor.contains(this._image_preview)) {
            this.actor.remove_child(this._image_preview);
        }
    },

    get_display: function(model, index) {
        this.title_label = this.get_title();
        this._history_item = model.get(index);
        this._history_item.connect('destroy',
            Lang.bind(this, function() {
                let hash = this._history_item.hash;
                model.delete(
                    Lang.bind(this, function(item) {
                        return item.hash === hash;
                    })
                );
            })
        );

        if(!Utils.is_blank(this._history_item.markup)) {
            this._show_markup(this._history_item.markup);
        }
        else {
            this._show_text(this._history_item.text);
        }

        this.actor.add(this.title_label, {
            row: 0,
            col: 1,
            x_expand: true,
            x_fill: true,
            x_align: St.Align.START,
            y_expand: false,
            y_fill: false,
            y_align: St.Align.MIDDLE
        });

        if(this._history_item.hidden) this.actor.hide();

        return this.actor;
    },

    get_title: function() {
        let title_label = new St.Label();
        title_label.clutter_text.set_single_line_mode(true);
        title_label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        title_label.clutter_text.set_max_length(MAX_DISPLAYED_STRING_LENGTH);
        return title_label;
    }
});
