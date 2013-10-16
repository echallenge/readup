var express = require('express');
var db = require('../../config/db');
var sequelize = db.sequelize;
var phantom = require('node-phantom');
var request = require('request');
var cheerio = require('cheerio');
var Q = require('q');

var Item = db.Item;
var Tag = db.Tag;
var Vote = db.Vote;
var Category = db.Category;
var Vote = db.Vote;

exports.getAllTagsForItem = function(req, res){
  Item.find({where: {id: 1}}).success(function(item){
    item.getTags().success(function(tags){console.log('ALL TAGS FOR ITEM 1', tags);});
  });
};

var castUpVote = function(userId, itemId) {
  Vote.find({where: ['UserId=? AND ItemId=?', userId, itemId]})
  .success(function(vote){
    if(!vote){
      Vote.create({ UserId: userId, ItemId: itemId, value: 1 });
    }
    else if (vote.selectedValues.value !== 1) {
      vote.updateAttributes({value: 1});
    }
  });
};

var addTags = function(item, tags) {
  for(var i in tags){
    Tag.findOrCreate({ name: tags[i] }).success(function(tag, created) {
      item.addTag(tag);
    });
  }
};

var addCategories = function(item, categories) {
  for (var j in categories) {
    Category.findOrCreate({name: categories[j] }).success(function(category, created) {
      item.addCategory(category);
    })
  }
};

exports.create = function(req, res){
  console.log('request', req.body)
  if(req.user){
    var title;
    Q.fcall(
      function(){
        deferred = Q.defer()
        request(req.body.link, function(error, response, body) {
        // Hand the HTML response off to Cheerio and assign that to
        //  a local $ variable to provide familiar jQuery syntax.
          var $ = cheerio.load(body);

        // Exactly the same code that we used in the browser before:
          // var title;
          $('title').each(function() {
            title = $(this).text();
            deferred.resolve(title.replace(/^[\s+\.]|[\s+\.]$/g, ""))
          });
          return title.replace(/ +?/g, '')
        })
        return deferred.promise
      }
    ).then(
      function(title){
        Item.find({ where:{link: req.body.link}}).success(function(item) {
            if (item) {
              addTags(item, req.body.tags);
              addCategories(item, req.body.categories);
              castUpVote(req.user.dataValues.id, item.dataValues.id);
            } else {
              Item.findOrCreate({title: req.body.title, link: req.body.link, UserId: req.user.dataValues.id })
              .success(function(item) {
                addTags(item, req.body.tags);
                addCategories(item, req.body.categories);
                castUpVote(req.user.dataValues.id, item.dataValues.id);

                item_id = item.dataValues.id;
                link = req.body.link;

                phantom.create(function(err,ph) {
                  return ph.createPage(function(err,page) {
                    page.set('viewportSize', { width: 1024, height: 768 });
                    return page.open(link, function(err,status) {
                      page.render('public/item_images/' + item_id + '.png', function(){console.log('rendering');});
                      page.close(function(){
                      });
                    });
                  });
                });
              });
            }
        });

        res.end('done');
      }).done(function(){console.log("DONE FINALLY")});
  } else {
    res.send(200);
  }
};

exports.getOne = function(req, res){
  Vote.findAll({where: {ItemId:req.params.id}}).success(function(votes) {
    var score = 0;

    for (var j = 0; j < votes.length; j++) {
      score += votes[j].selectedValues.value;
    }
    Item.find({include: [Tag], where: {id: req.params.id}}).success(function(item){
      var resItem = {};

      resItem = item.selectedValues;
      resItem.tags = [];
      for (var i =0; i < item.tags.length; i++) {
        resItem.tags.push(item.tags[i].selectedValues);
      }
      resItem.score = score;
      res.send(resItem);
    });
  });
};

exports.getScore = function(req, res){
  var score = 0;
  Vote.findAll({where: {ItemId: req.params.id}}).success(function(votes){
    for(var i = 0; i < votes.length; i++){
      score += votes[i].value;
    }
    res.send({score: score});
  });
};