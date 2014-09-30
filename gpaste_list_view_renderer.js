const St = imports.gi.St;
const Lang = imports.lang;
const Pango = imports.gi.Pango;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const Mainloop = imports.mainloop;
const Tweener = imports.ui.tweener;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const ListView = Me.imports.list_view;
const ItemInfoView = Me.imports.item_info_view;
const GPasteClient = Me.imports.gpaste_client;
const PrefsKeys = Me.imports.prefs_keys;
const Constants = Me.imports.constants;

const MAX_DISPLAYED_STRING_LENGTH = 300;

const HIGHLIGHT_MARKUP = {
    START: "<span foreground='white' font_weight='heavy' underline='single'>",
    STOP: '</span>'
};

const INFO_ANIMATION_TIME_S = 0.2;
const IMAGE_PREVIEW_WIDTH = 100;
const IMAGE_PREVIEW_HEIGHT = 100;

const FILE_MARK_COLOR = 'rgba(201, 0, 0, 1)';
const IMAGE_MARK_COLOR = 'rgba(255, 85, 0, 1)';
const LINK_MARK_COLOR = 'rgba(0, 185, 25, 1)';
const TEXT_MARK_COLOR = 'rgba(0, 0, 0, 0.4)';
const COLOR_MARK_WIDTH = 3;

const CONNECTION_IDS = {
    ITEM_DESTROY: 0,
    ITEM_INACTIVE_CHANGED: 0
};

const GPasteListViewRenderer = new Lang.Class({
    Name: 'GPasteListViewRenderer',
    Extends: ListView.RendererBase,

    _init: function(params) {
        this.parent({
            style_class: 'gpaste-item-box',
        });

        this._info_view = new ItemInfoView.ItemInfoView({
            label_style_class: 'gpaste-item-box-info-label'
        });
        this._info_view.actor.set_pivot_point(0.5, 0.5);
        this._history_item = null;
        this._image_preview = null;
        this._color_mark = null;
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
            this.actor.get_height(), //IMAGE_PREVIEW_HEIGHT,
            scale_factor
        );
        this.actor.add(this._image_preview, {
            row: 0,
            row_span: 2,
            col: 1,
            x_expand: false,
            x_fill: false,
            x_align: St.Align.START,
            y_expand: false,
            y_fill: false,
            y_align: St.Align.MIDDLE
        });
    },

    _show_color_mark: function(color_string) {
        this._color_mark = new St.Bin({
            width: COLOR_MARK_WIDTH,
            margin_right: 3
        });
        this._color_mark.set_translation(-2, 0, 0);
        let [res, color] = Clutter.Color.from_string(color_string);
        this._color_mark.set_background_color(color);

        this.actor.add(this._color_mark, {
            row: 0,
            row_span: 2,
            col: 0,
            x_expand: false,
            x_fill: false,
            x_align: St.Align.MIDDLE,
            y_expand: true,
            y_fill: true,
            y_align: St.Align.MIDDLE
        });
    },

    _highlight: function(history_item) {
        if(history_item.inactive) {
            this.actor.add_style_pseudo_class('inactive');
        }
        else {
            this.actor.remove_style_pseudo_class('inactive');
        }
    },

    show_info: function(animation) {
        if(!this._history_item.hash || this._info_view.shown) return;

        function on_info_result(text, uri) {
            if(!text) return;

            this.actor.add(this._info_view.actor, {
                row: 1,
                col: 2,
                x_expand: false,
                x_fill: false,
                x_align: St.Align.START,
                y_expand: false,
                y_fill: false,
                y_align: St.Align.START
            });
            this._info_view.set_text(text);

            if(Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_IMAGE_PREVIEW_KEY)) {
                if(uri !== null) this._show_image_preview(uri);
            }

            if(!animation) {
                this._info_view.show();
                return;
            }

            let height = this._info_view.actor.get_height();
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
        }

        this._history_item.get_info(Lang.bind(this, on_info_result));
    },

    hide_info: function(animation) {
        if(!this._info_view.shown) return;

        if(this._image_preview && this.actor.contains(this._image_preview)) {
            this.actor.remove_child(this._image_preview);
        }

        if(!animation) {
            this.actor.remove_child(this._info_view.actor);
            this._info_view.hide();
            this._info_view.set_text('');
            this._info_view.actor.set_height(height);
            this._info_view.actor.set_scale(1, 1);
            this._info_view.actor.set_opacity(255);
            return;
        }

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
    },

    get_display: function(model, index) {
        this.title_label = this.get_title();
        this._history_item = model.get(index);
        CONNECTION_IDS.ITEM_INACTIVE_CHANGED = this._history_item.connect(
            'inactive-changed',
            Lang.bind(this, this._highlight)
        );
        CONNECTION_IDS.ITEM_DESTROY = this._history_item.connect(
            'destroy',
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
            let text = this._history_item.text;
            if(Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_COLOR_MARKS_KEY)) {
                text = this._history_item.text_without_type;
            }
            this._show_text(text);
        }

        this.actor.add(this.title_label, {
            row: 0,
            col: 2,
            x_expand: true,
            x_fill: true,
            x_align: St.Align.START,
            y_expand: false,
            y_fill: false,
            y_align: St.Align.MIDDLE
        });

        this._highlight(this._history_item);
        this.actor._delegate = this;

        let item_info_mode = Utils.SETTINGS.get_int(PrefsKeys.ITEM_INFO_MODE_KEY);
        if(item_info_mode === Constants.ITEM_INFO_MODE.ALWAYS) this.show_info();
        if(item_info_mode === Constants.ITEM_INFO_MODE.ALWAYS_FOR_FILES) {
            let is_file =
                this._history_item.is_file_item()
                || this._history_item.is_image_item();
            if(is_file) this.show_info();
        }

        if(Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_COLOR_MARKS_KEY)) {
            let color;

            if(this._history_item.is_file_item()) color = FILE_MARK_COLOR;
            else if(this._history_item.is_image_item()) color = IMAGE_MARK_COLOR
            else if(this._history_item.is_link_item()) color = LINK_MARK_COLOR
            else color = TEXT_MARK_COLOR;

            this._show_color_mark(color);
        }

        return this.actor;
    },

    get_title: function() {
        let title_label = new St.Label();
        title_label.clutter_text.set_single_line_mode(true);
        title_label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        title_label.clutter_text.set_max_length(MAX_DISPLAYED_STRING_LENGTH);
        return title_label;
    },

    get info_shown() {
        return this._info_view.shown;
    }
});
