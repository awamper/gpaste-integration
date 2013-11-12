const St = imports.gi.St;
const Lang = imports.lang;
const Pango = imports.gi.Pango;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const GPasteItem = new Lang.Class({
    Name: "GPasteItem",

    _init: function(data) {
        this.actor = new St.Label({
            style_class: "gpaste-item-box",
            reactive: true
        });
        this.actor.clutter_text.set_single_line_mode(true);
        this.actor.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);

        this.id = data.id;
        this.content = data.content;
        this.markup = data.markup;

        if(this.markup) {
            this.set_label_markup(this.markup);
        }
        else {
            this.set_label(this.content);
        }
    },

    set_label: function(text) {
        this.actor.set_text(text);
    },

    set_label_markup: function(markup) {
        if(markup !== false) {
            let start_index = markup.indexOf(
                "<span foreground='white' font_weight='heavy'>"
            );
            let min = 45;

            if(start_index !== -1 && start_index > min) {
                markup = markup.slice(start_index - min);
            }

            this.actor.clutter_text.set_markup(markup);
        }
    },

    hide: function() {
        this.actor.hide();
    },

    show: function() {
        this.actor.show();
    },

    destroy: function() {
        this.actor.destroy();
        this._content = null;
        this._markup_data = null;
        this.id = null;
    },

    get content() {
        return this._content;
    },

    set content(str) {
        this._content = str.replace(/\n/g, ' ');
        this._content = this._content.replace(/\s{2,}/g, ' ');
    },

    get markup() {
        return this._markup_data;
    },

    set markup(markup) {
        if(!markup) {
            this._markup_data = false;
            return;
        }

        this._markup_data = markup.replace(/\n/g, ' ');
        this._markup_data = this._markup_data.replace(/\s{2,}/g, ' ');
    }
});
