const St = imports.gi.St;
const Lang = imports.lang;
const Params = imports.misc.params;

const ItemInfoView = new Lang.Class({
    Name: 'ItemInfoView',

    _init: function(params) {
        this._params = new Params.parse(params, {
            box_style_class: '',
            label_style_class: ''
        });

        this._label = new St.Label({
            style_class: this._params.label_style_class
        });

        this.actor = new St.BoxLayout({
            style_class: this._params.box_style_class
        });
        this.actor.add(this._label, {
            x_expand: false,
            x_fill: false,
            x_align: St.Align.MIDDLE,
            y_expand: false,
            y_fill: false,
            y_align: St.Align.MIDDLE
        });
        this.actor.hide();
    },

    set_text: function(text) {
        this._label.set_text('\u25B6 ' + text);
    },

    show: function() {
        this.actor.show();
    },

    hide: function() {
        this.actor.hide();
    },

    destroy: function() {
        this.actor.destroy();
    },

    get shown() {
        return this.actor.visible;
    }
});
